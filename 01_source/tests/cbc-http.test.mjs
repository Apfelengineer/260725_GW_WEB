/** 配布版を一時PHPサーバーで動かし、renkon→origin→APIを実通信で検証します。 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

const temporary = await mkdtemp(join(tmpdir(), 'kptc-cbc-test-'));
const base = 'http://127.0.0.1:18903';
const server = spawn('php', ['-S','127.0.0.1:18903','-t',fileURLToPath(new URL('../../02_release/', import.meta.url))], {
  env: {...process.env, KPTC_INTERNAL_SCHEDULER_DB:join(temporary,'test.sqlite'),
    KPTC_PUBLIC_AVAILABILITY_JSON:join(temporary,'public.json'),
    KPTC_AVAILABILITY_STATUS_JSON:join(temporary,'status.json'),
    KPTC_SESSION_COOKIE_SECURE:'0', KPTC_RENKON_SCHEDULER_URL:base+'/origin/Scheduler/', KPTC_PORTAL_TOKEN_KEY:'SecretKey'},
  stdio:['ignore','ignore','pipe'],
});
try {
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('PHP startup timeout')),5000);
    server.once('error', reject);
    server.stderr.on('data', chunk => {
      if (chunk.toString().includes('Development Server')) { clearTimeout(timeout); resolve(); }
      if (chunk.toString().includes('Failed to listen')) { clearTimeout(timeout); reject(new Error('PHP failed to listen')); }
    });
  });
  assert.equal((await fetch(base+'/origin/Scheduler/')).status,403);
  assert.equal((await fetch(base+'/origin/Scheduler/api.php?action=bootstrap')).status,403);
  assert.equal((await fetch(base+'/renkon/open-scheduler.php?user_id=12')).status,403);
  const locations = [];
  for (let i=0;i<2;i++) {
    const response = await fetch(base+'/renkon/open-scheduler.php?user_id=007',{redirect:'manual'});
    assert.equal(response.status,302);
    locations.push(response.headers.get('location'));
  }
  assert.notEqual(locations[0],locations[1]);
  const entry = await fetch(locations[0]);
  assert.equal(entry.status,200);
  let cookie = entry.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const bootstrap = await fetch(base+'/origin/Scheduler/api.php?action=bootstrap',{headers:{cookie}});
  assert.equal(bootstrap.status,200);
  const payload = await bootstrap.json();
  assert.equal(payload.portalUserId,'007');
  assert.equal(payload.role,'user');
  cookie = bootstrap.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') || cookie;
  const createdSchedule = {
    id:'delta-test-schedule', memberId:payload.state.members[0].id,
    date:'2027-12-01', endDate:'2027-12-01', start:'09:00', end:'10:00',
    timePreset:'custom', title:'差分保存試験', location:'第一会議室', category:payload.state.categories[0].name, memo:'', private:false,
  };
  const deltaSave = await fetch(base+'/origin/Scheduler/api.php?action=save-delta',{
    method:'POST', headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':payload.csrfToken},
    body:JSON.stringify({version:payload.version,action:'予定作成',summary:'差分保存試験',delta:{scheduleUpserts:[createdSchedule],scheduleDeleteIds:[]}}),
  });
  assert.equal(deltaSave.status,200);
  const savedPayload = await deltaSave.json();
  assert.equal(savedPayload.version,payload.version+1);
  assert.equal(savedPayload.state.schedules.filter(item => item.id===createdSchedule.id).length,1);
  assert.equal(savedPayload.state.schedules.find(item=>item.id===createdSchedule.id).location,'第一会議室');
  assert.equal(savedPayload.availabilityPublish.pending, true, 'Generation is not delivery');
  const delivery = spawnSync('python3', [fileURLToPath(new URL('../publisher/delivery.py', import.meta.url)), '--once'], {
    env: { ...process.env, KPTC_AVAILABILITY_DELIVERY_MODE: 'local', KPTC_AVAILABILITY_SOURCE_JSON: join(temporary, 'public.json'), KPTC_AVAILABILITY_STATUS_JSON: join(temporary, 'status.json'), KPTC_AVAILABILITY_LOCAL_JSON: join(temporary, 'calendar', 'public-availability.json') },
    encoding: 'utf8',
  });
  assert.equal(delivery.status, 0, delivery.stdout + delivery.stderr);
  const delivered = await (await fetch(base+'/origin/Scheduler/api.php?action=bootstrap', { headers: { cookie } })).json();
  assert.equal(delivered.availabilityPublish.pending, false, 'Bootstrap reflects actual public JSON delivery');
  const testPassword = randomBytes(18).toString('hex');
  const setup = spawnSync('php', ['-r', 'require $argv[1]; $pdo=new PDO("sqlite:".$argv[2]); kptc_auth_set_admin_password($pdo, $argv[3]);', fileURLToPath(new URL('../../02_release/origin/Scheduler/auth.php', import.meta.url)), join(temporary, 'test.sqlite'), testPassword], { encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  const post = (action, payload, data) => fetch(base+'/origin/Scheduler/api.php?action='+action, {
    method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': payload.csrfToken }, body: JSON.stringify(data),
  });
  const empty = { scheduleUpserts: [], scheduleDeleteIds: [] };
  const noChange = await post('save-delta', savedPayload, { version: savedPayload.version, delta: empty });
  assert.equal(noChange.status, 200);
  assert.equal((await noChange.json()).version, savedPayload.version, 'Empty delta must not increment version');
  const admin = await post('admin-mode-enter', savedPayload, { password: testPassword });
  assert.equal(admin.status, 200);
  cookie = admin.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') || cookie;
  const adminPayload = await admin.json();
  assert.equal(adminPayload.role, 'admin');
  assert.notEqual(adminPayload.csrfToken, savedPayload.csrfToken);
  const oldToken = await post('save-delta', savedPayload, { version: adminPayload.version, delta: empty });
  assert.equal(oldToken.status, 403, 'Stale CSRF must remain rejected');
  assert.equal((await oldToken.json()).error, 'セッションを確認できません');
  const currentToken = await post('save-delta', adminPayload, { version: adminPayload.version, delta: empty });
  assert.equal(currentToken.status, 200, 'Save with rotated CSRF must succeed');
  const general = await post('admin-mode-exit', adminPayload, {});
  assert.equal(general.status, 200);
  const generalPayload = await general.json();
  assert.equal(generalPayload.role, 'user');
  const updatedSchedule = { ...createdSchedule, title: '管理者切替後の保存試験' };
  const afterSwitch = await post('save-delta', generalPayload, { version: generalPayload.version, delta: { scheduleUpserts: [updatedSchedule], scheduleDeleteIds: [] } });
  assert.equal(afterSwitch.status, 200);
  const reloaded = await fetch(base+'/origin/Scheduler/api.php?action=bootstrap', { headers: { cookie } });
  const reloadedSchedule = (await reloaded.json()).state.schedules.find(item => item.id === createdSchedule.id);
  assert.equal(reloadedSchedule.title, updatedSchedule.title);
  assert.equal(reloadedSchedule.location, '第一会議室');
  assert.equal((await fetch(base+'/origin/Scheduler/api.php?action=bootstrap',{headers:{cookie}})).status,200);
  assert.equal((await fetch(base+'/origin/Scheduler/',{headers:{cookie}})).status,403);
  assert.equal((await fetch(base+'/origin/Scheduler/?token=invalid')).status,403);
  // JSONファイル取込：一般モード不可、確認のみでは書込まず、全件成功か全件中止。
  const fresh = await (await fetch(base+'/origin/Scheduler/api.php?action=bootstrap', { headers: { cookie } })).json();
  const importItems = [{ id:'import-test-past', memberId:fresh.state.members[0].id, date:'2001-01-01', start:'09:00', end:'12:00', title:'JSON移行試験', location:'移行元の会議室', category:fresh.state.categories[0].name },
    { id:'import-test-future', memberId:fresh.state.members[0].id, date:'2100-01-01', start:'13:00', end:'17:00', title:'JSON未来試験', category:fresh.state.categories[0].name }];
  async function upload(items, operation, payload, token=payload.csrfToken) {
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify({ schedules:items })], { type:'application/json' }), 'schedules.json');
    form.append('operation',operation); form.append('version',String(payload.version));
    return fetch(base+'/origin/Scheduler/api.php?action=import-schedules', { method:'POST', headers:{cookie,'X-CSRF-Token':token},body:form });
  }
  assert.equal((await upload(importItems,'preview',fresh)).status,403,'General user cannot import');
  const adminAgain = await post('admin-mode-enter',fresh,{password:testPassword});
  cookie = adminAgain.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ') || cookie;
  const importAdmin = await adminAgain.json();
  assert.equal((await upload(importItems,'apply',importAdmin,'wrong-token')).status,403);
  const checkedResponse = await upload(importItems,'preview',importAdmin);
  assert.equal(checkedResponse.status,200);
  const checked = await checkedResponse.json();
  assert.equal(checked.importResult.added,2);
  assert.equal(checked.version,importAdmin.version);
  assert.equal(checked.state.schedules.some(item=>item.id==='import-test-past'),false);
  const invalid = await upload([...importItems,{...importItems[0],id:'invalid',date:'2026-02-30'}],'apply',checked);
  assert.equal(invalid.status,422);
  const afterInvalid = await (await fetch(base+'/origin/Scheduler/api.php?action=bootstrap',{headers:{cookie}})).json();
  assert.equal(afterInvalid.version,checked.version);
  assert.equal(afterInvalid.state.schedules.some(item=>item.id==='import-test-past'),false);
  assert.equal((await upload(importItems,'apply',{...checked,version:checked.version-1})).status,409);
  const importedResponse = await upload(importItems,'apply',checked);
  assert.equal(importedResponse.status,200);
  const imported = await importedResponse.json();
  assert.equal(imported.version,checked.version+1);
  assert.equal(imported.state.schedules.filter(item=>item.id.startsWith('import-test-')).length,2);
  assert.equal(imported.state.schedules.find(item=>item.id==='import-test-past').location,'移行元の会議室');
  assert.equal(imported.state.schedules.some(item=>item.id===createdSchedule.id),true,'Existing schedules retained');
  assert.deepEqual(imported.state.members,checked.state.members);
  assert.deepEqual(imported.authAccounts,checked.authAccounts);
  const repeated = await (await upload(importItems,'apply',imported)).json();
  assert.equal(repeated.importResult.added,0);
  assert.equal(repeated.importResult.skipped,2);
  assert.equal(repeated.version,imported.version);
  assert.equal((await upload([{...importItems[0],title:'異なる内容'}],'apply',repeated)).status,422);
  const persisted = await (await fetch(base+'/origin/Scheduler/api.php?action=bootstrap',{headers:{cookie}})).json();
  assert.equal(persisted.state.schedules.filter(item=>item.id.startsWith('import-test-')).length,2);
  for(const member of persisted.state.members) assert.match(member.id,member.group==='試験室'?/^t\d{3}$/:/^e\d{3}$/);
  const template = persisted.state.members.find(member=>member.group==='電気通信係');
  const maxE = Math.max(...persisted.state.members.filter(m=>m.group==='電気通信係').map(m=>Number(m.id.slice(1))));
  async function createUser(payload,name){
    const response = await post('member-account',payload,{operation:'create',version:payload.version,member:{...template,id:'',name},username:'test-'+name,role:'user'});
    assert.equal(response.status,200);return response.json();
  }
  const added=await createUser(persisted,'first');
  const first=added.state.members.find(m=>m.name==='first');
  assert.equal(first.id,'e'+String(maxE+1).padStart(3,'0'));
  const reorderedResponse=await post('save-delta',added,{version:added.version,delta:{...empty,members:[...added.state.members].reverse()}});
  assert.equal(reorderedResponse.status,200);
  const reordered=await reorderedResponse.json();
  assert.deepEqual(reordered.state.members.map(m=>m.id).sort(),added.state.members.map(m=>m.id).sort());
  const deletedResponse=await post('member-account',reordered,{operation:'delete',version:reordered.version,member:first,username:'test-first',role:'user'});
  assert.equal(deletedResponse.status,200);
  const deleted=await deletedResponse.json();
  const second=await createUser(deleted,'second');
  const movedMember=second.state.members.find(m=>m.name==='second');
  assert.equal(movedMember.id,'e'+String(maxE+2).padStart(3,'0'),'Deleted ID not reused');
  const withScheduleResponse=await post('save-delta',second,{version:second.version,delta:{...empty,scheduleUpserts:[{...createdSchedule,id:'transfer-test',memberId:movedMember.id}]}});
  assert.equal(withScheduleResponse.status,200);
  const withSchedule=await withScheduleResponse.json();
  const changedResponse=await post('member-account',withSchedule,{operation:'save',version:withSchedule.version,member:{...movedMember,group:'試験室'},username:'test-second',role:'user'});
  assert.equal(changedResponse.status,200);
  const changed=await changedResponse.json();assert.equal(changed.state.members.find(m=>m.name==='second').id,'t004');
  assert.equal(changed.authAccounts.find(a=>a.username==='test-second').memberId,'t004');
  assert.equal(changed.state.schedules.find(s=>s.id==='transfer-test').memberId,'t004');
  const invalidCreate=await post('member-account',changed,{operation:'create',version:changed.version,member:{...template,id:'e999'},username:'bad-id',role:'user'});
  assert.equal(invalidCreate.status,422,'Clients cannot pick arbitrary IDs');
  const roomCheck=spawnSync('php',['-r','require $argv[1];$p=new PDO("sqlite:".$argv[2]);$s=json_decode($p->query("SELECT payload FROM app_state WHERE id=1")->fetchColumn(),true);echo json_encode(kptc_public_rooms_from_state($s));',fileURLToPath(new URL('../../02_release/origin/Scheduler/availability-room-config.php',import.meta.url)),join(temporary,'test.sqlite')],{encoding:'utf8'});
  assert.equal(roomCheck.status,0,roomCheck.stderr);
  assert.deepEqual(JSON.parse(roomCheck.stdout).map(r=>r.id),['t001','t002','t003']);
  assert.deepEqual(JSON.parse(roomCheck.stdout).map(r=>r.image),['m6.png','m7.png','m8.png']);
  console.log('CBC HTTP: auth/save/import; automatic e/t IDs, new users, no renumber/reuse, department transfer/account links, client ID rejection and public room mapping: OK');
} finally {
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server,'exit');
  await rm(temporary,{recursive:true,force:true});
}
