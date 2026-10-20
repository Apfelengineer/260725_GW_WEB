import assert from 'node:assert/strict';
import test from 'node:test';
import { SchedulerSync, applyDelta, hasChanges, stateDelta } from '../origin/shared/app/lib/scheduler-sync.ts';

const pause = () => new Promise(resolve => setTimeout(resolve, 15));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  return {
    state: { members: [{ id: 'm1', name: '試験ユーザー' }], categories: [{ id: 'c1', name: 'その他' }], schedules: [] },
    version: 1, csrfToken: 'token-initial', role: 'user', authenticated: true,
  };
}
const schedule = (id, title = id) => ({ id, memberId: 'm1', title, category: 'その他', date: '2026-10-20' });
const mutation = { action: '予定作成', summary: '試験予定', successMessage: '保存完了' };

function harness(overrides = {}) {
  const h = { remote: fixture(), applied: [], statuses: [], errors: [], saved: [], requests: [] };
  h.sync = new SchedulerSync({
    delay: 0,
    save: async (delta, payload) => {
      h.requests.push({ delta, token: payload.csrfToken, version: payload.version });
      assert.equal(payload.csrfToken, h.remote.csrfToken);
      assert.equal(payload.version, h.remote.version);
      h.remote = { ...h.remote, state: applyDelta(h.remote.state, delta), version: h.remote.version + 1 };
      return h.remote;
    },
    bootstrap: async () => h.remote,
    onApply: (payload, visible) => h.applied.push({ payload, visible }),
    onStatus: status => h.statuses.push(status),
    onSaved: entry => h.saved.push(entry),
    onError: message => h.errors.push(message),
    ...overrides,
  });
  h.sync.initialize(h.remote);
  return h;
}

test('項目順の異なる初期データでも、無操作の保存を繰り返さない', async () => {
  const h = harness();
  const { members, categories, schedules } = h.remote.state;
  h.sync.update({ schedules, members: members.map(({ id, name }) => ({ name, id })), categories }, mutation);
  await pause();
  assert.equal(h.sync.dirty, false);
  assert.equal(h.requests.length, 0);
  assert.deepEqual(h.statuses, ['saved']);
  assert.equal(hasChanges(stateDelta(h.remote.state, { members, schedules, categories })), false);
});

test('保存の応答待ち中の追加・削除を保持し、最後の変更まで保存してから通知する', async () => {
  const entered = deferred();
  const release = deferred();
  let calls = 0;
  const h = harness({ save: async (delta, payload) => {
    calls++;
    if (calls === 1) { entered.resolve(); await release.promise; }
    h.requests.push({ delta, token: payload.csrfToken, version: payload.version });
    assert.equal(payload.version, h.remote.version);
    h.remote = { ...h.remote, state: applyDelta(h.remote.state, delta), version: payload.version + 1 };
    return h.remote;
  } });
  h.sync.update({ ...h.remote.state, schedules: [schedule('a')] }, mutation);
  await entered.promise;
  assert.equal(h.saved.length, 0);
  h.sync.update({ ...h.remote.state, schedules: [schedule('b')] }, mutation);
  release.resolve();
  await h.sync.command(async payload => payload);
  assert.deepEqual(h.remote.state.schedules.map(item => item.id), ['b']);
  assert.deepEqual(h.requests[1].delta.scheduleDeleteIds, ['a']);
  assert.equal(h.applied.some(item => item.visible.schedules.length === 0), true); // 初期表示だけ
  assert.deepEqual(h.applied.slice(1).map(item => item.visible.schedules.map(s => s.id)), [['b'], ['b'], ['b']]);
  assert.equal(h.saved.length, 1);
  assert.equal(h.sync.dirty, false);
  h.sync.cancelTimer();
});

test('保存と管理者切替を直列実行し、切替中の編集は更新後のCSRFで保存する', async () => {
  const saving = deferred();
  const releaseSave = deferred();
  const switching = deferred();
  const releaseSwitch = deferred();
  const events = [];
  const h = harness({ save: async (delta, payload) => {
    events.push(`save:${payload.csrfToken}`);
    assert.equal(payload.csrfToken, h.remote.csrfToken);
    if (events.length === 1) { saving.resolve(); await releaseSave.promise; }
    h.remote = { ...h.remote, state: applyDelta(h.remote.state, delta), version: h.remote.version + 1 };
    return h.remote;
  } });
  h.sync.update({ ...h.remote.state, schedules: [schedule('a')] }, mutation);
  await saving.promise;
  const command = h.sync.command(async payload => {
    events.push(`admin:${payload.csrfToken}`);
    switching.resolve();
    await releaseSwitch.promise;
    h.remote = { ...h.remote, role: 'admin', csrfToken: 'token-admin' };
    return h.remote;
  });
  releaseSave.resolve();
  await switching.promise;
  h.sync.update({ ...h.remote.state, schedules: [...h.remote.state.schedules, schedule('b')] }, mutation);
  releaseSwitch.resolve();
  await command;
  await pause();
  assert.deepEqual(events, ['save:token-initial', 'admin:token-initial', 'save:token-admin']);
  assert.deepEqual(h.remote.state.schedules.map(item => item.id), ['a', 'b']);
  assert.equal(h.statuses.includes('offline'), false);
  assert.equal(h.sync.dirty, false);
});

test('保存失敗時は変更を保持して自動再送を停止し、明示再試行で最新CSRFを取得する', async () => {
  let fail = true;
  let attempts = 0;
  let bootstraps = 0;
  const h = harness({
    save: async (delta, payload) => {
      attempts++;
      if (fail) throw Object.assign(new Error('セッションを確認できません'), { status: 403 });
      assert.equal(payload.csrfToken, 'token-refreshed');
      h.remote = { ...h.remote, state: applyDelta(h.remote.state, delta), version: h.remote.version + 1 };
      return h.remote;
    },
    bootstrap: async () => { bootstraps++; h.remote = { ...h.remote, csrfToken: 'token-refreshed' }; return h.remote; },
  });
  h.sync.update({ ...h.remote.state, schedules: [schedule('a')] }, mutation);
  await pause();
  assert.equal(h.statuses.at(-1), 'offline');
  assert.equal(h.sync.dirty, true);
  assert.equal(h.saved.length, 0);
  await pause();
  assert.equal(attempts, 1);
  await assert.rejects(h.sync.command(async payload => payload), /未保存/);
  fail = false;
  await h.sync.retry();
  assert.equal(bootstraps, 1);
  assert.equal(attempts, 2);
  assert.equal(h.saved.length, 1);
  assert.equal(h.remote.state.schedules[0].id, 'a');
  assert.equal(h.statuses.at(-1), 'saved');
});

test('別利用者との409競合でもローカルとサーバーの予定を残し、再試行で統合する', async () => {
  let first = true;
  const h = harness({ save: async (delta, payload) => {
    if (first) {
      first = false;
      h.remote = { ...h.remote, version: 2, state: { ...h.remote.state, schedules: [schedule('other')] } };
      throw Object.assign(new Error('別の利用者による更新がありました'), { status: 409, payload: h.remote });
    }
    assert.equal(payload.version, 2);
    h.remote = { ...h.remote, version: 3, state: applyDelta(h.remote.state, delta) };
    return h.remote;
  } });
  h.sync.update({ ...h.remote.state, schedules: [schedule('mine')] }, mutation);
  await pause();
  assert.deepEqual(h.applied.at(-1).visible.schedules.map(item => item.id), ['other', 'mine']);
  assert.equal(h.sync.dirty, true);
  await h.sync.retry();
  assert.deepEqual(h.remote.state.schedules.map(item => item.id), ['other', 'mine']);
});

test('パスワード間違いは保存失敗と混同せず、次の切替も実行できる', async () => {
  const h = harness();
  await assert.rejects(h.sync.command(async () => { throw Object.assign(new Error('管理者パスワードが正しくありません'), { status: 401 }); }));
  assert.equal(h.statuses.includes('offline'), false);
  await h.sync.command(async payload => ({ ...payload, role: 'admin', csrfToken: 'admin' }));
  assert.equal(h.applied.at(-1).payload.role, 'admin');
});
