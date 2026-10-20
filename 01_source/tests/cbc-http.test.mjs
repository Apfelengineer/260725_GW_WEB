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
    KPTC_PUBLIC_AVAILABILITY_JSON:join(temporary,'public.json'), KPTC_PUBLIC_AVAILABILITY_MODE:'local',
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
    timePreset:'custom', title:'差分保存試験', category:payload.state.categories[0].name, memo:'', private:false,
  };
  const deltaSave = await fetch(base+'/origin/Scheduler/api.php?action=save-delta',{
    method:'POST', headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':payload.csrfToken},
    body:JSON.stringify({version:payload.version,action:'予定作成',summary:'差分保存試験',delta:{scheduleUpserts:[createdSchedule],scheduleDeleteIds:[]}}),
  });
  assert.equal(deltaSave.status,200);
  const savedPayload = await deltaSave.json();
  assert.equal(savedPayload.version,payload.version+1);
  assert.equal(savedPayload.state.schedules.filter(item => item.id===createdSchedule.id).length,1);
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
  assert.equal((await reloaded.json()).state.schedules.find(item => item.id === createdSchedule.id).title, updatedSchedule.title);
  assert.equal((await fetch(base+'/origin/Scheduler/api.php?action=bootstrap',{headers:{cookie}})).status,200);
  assert.equal((await fetch(base+'/origin/Scheduler/',{headers:{cookie}})).status,403);
  assert.equal((await fetch(base+'/origin/Scheduler/?token=invalid')).status,403);
  console.log('CBC HTTP: entry/API, delta save, empty delta, admin enter/exit, CSRF rotation, stale token rejection, persistence after reload: OK');
} finally {
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server,'exit');
  await rm(temporary,{recursive:true,force:true});
}
