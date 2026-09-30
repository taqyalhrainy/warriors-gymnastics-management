import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';
import * as cache from '../src/services/cache.js';

const globals = { window: { dispatchEvent() {} }, Event: class {}, CustomEvent: class {} };
const service = (name, api) => load(`../src/services/${name}.js`, { './api.js': { default: api }, './cache.js': cache }, globals);

test('player mutations invalidate paginated rows, compact rows, board and subscription caches', async () => {
  cache.clearCache();
  const keys = ['players:page:[]', 'players:list:compact', 'groups:attendance-board', 'subscriptions:list'];
  const api = { post: async () => ({ data: { _id: 'p' } }), put: async () => ({ data: { _id: 'p', __v: 2 } }), delete: async () => ({ data: {} }) };
  const players = await service('players', api);
  for (const mutate of [() => players.createPlayer({}), () => players.updatePlayer('p', {}), () => players.deletePlayer('p')]) {
    keys.forEach((key) => cache.setCached(key, 'stale'));
    await mutate();
    keys.forEach((key) => assert.equal(cache.getCachedValue(key), undefined, key));
  }
});

test('player edits include the loaded version and do not erase cache on rejected saves', async () => {
  cache.clearCache();
  cache.setCached('players:item:p', { _id: 'p', __v: 3, due: 0 });
  const players = await service('players', { put: async (url, data) => {
    assert.equal(data.expectedVersion, 3);
    throw new Error('conflict');
  } });
  await assert.rejects(players.updatePlayer('p', { due: 70 }), /conflict/);
  assert.equal(cache.getCachedValue('players:item:p').due, 0);
});

test('attendance and subscription mutations invalidate each other and the board', async () => {
  const api = { put: async () => ({ data: {} }) };
  const attendance = await service('attendance', api);
  const subscriptions = await service('subscriptions', api);
  const keys = ['attendance:today:current', 'subscriptions:list', 'players:page:[]', 'groups:attendance-board'];
  for (const mutate of [() => attendance.updateTodayAttendance({}), () => subscriptions.updateSubscription('s', {})]) {
    keys.forEach((key) => cache.setCached(key, 'stale'));
    await mutate();
    keys.forEach((key) => assert.equal(cache.getCachedValue(key), undefined, key));
  }
});

test('all report loaders run and forced refresh bypasses their saved results', async () => {
  cache.clearCache();
  let calls = 0;
  const reports = await service('reports', { get: async () => ({ data: ++calls }) });
  for (const loadReport of [reports.fetchDashboard, reports.fetchRevenue]) {
    const first = await loadReport();
    assert.equal(await loadReport(), first);
    assert.notEqual(await loadReport({ force: true }), first);
  }
  assert.equal(await reports.fetchAttendanceReport(), 5);
});

test('logout discards in-flight account data instead of refetching it in the next session', async () => {
  cache.clearCache();
  let finish;
  const oldRequest = cache.fetchCached('players:list', () => new Promise((resolve) => { finish = resolve; }));
  const rejected = assert.rejects(oldRequest, { name: 'AbortError' });
  cache.clearCache();
  cache.setCached('players:list', ['new account']);
  finish(['old account']);
  await rejected;
  assert.deepEqual(cache.getCachedValue('players:list'), ['new account']);
});
