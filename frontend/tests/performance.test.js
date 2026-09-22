import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCached, invalidateCache, getCachedValue, clearCache, setCached, updateCached } from '../src/services/cache.js';
import { groupBoardPlayers } from '../src/utils/groupBoardPlayers.js';

test('simultaneous refreshes share work but an edit starts a new request', async () => {
  clearCache();
  let resolveOld;
  let calls = 0;
  const loader = () => { calls += 1; return new Promise((resolve) => { resolveOld = resolve; }); };
  const first = fetchCached('groups:test', loader, { force: true });
  const second = fetchCached('groups:test', loader, { force: true });
  assert.equal(calls, 1);
  invalidateCache('groups:');
  assert.equal(await fetchCached('groups:test', async () => 'new'), 'new');
  resolveOld('old');
  assert.deepEqual(await Promise.all([first, second]), ['new', 'new']);
  assert.equal(getCachedValue('groups:test'), 'new');
});

test('a delayed read cannot overwrite a confirmed zero balance or a local cache update', async () => {
  for (const patch of [false, true]) {
    clearCache();
    const key = 'players:item:p';
    setCached(key, { due: 70 });
    let finish;
    const read = fetchCached(key, () => new Promise((resolve) => { finish = resolve; }), { force: true });
    if (patch) updateCached(key, () => ({ due: 0 }));
    else setCached(key, { due: 0 });
    finish({ due: 70 });
    assert.deepEqual(await read, { due: 0 });
    assert.deepEqual(getCachedValue(key), { due: 0 });
  }
});

test('batch board preserves legacy groupId, multiple groups, empty groups and counters', () => {
  const groups = [{ _id: 'a' }, { _id: 'b' }, { _id: 'empty' }];
  const player = { _id: 'p', groupId: { _id: 'a' }, groupIds: [{ _id: 'a' }, { _id: 'b' }], attendancePresentCount: 4 };
  const result = groupBoardPlayers({ groups, players: [player] });
  assert.deepEqual(result.map((g) => g.players.length), [1, 1, 0]);
  assert.equal(result[0].players[0].attendanceGroupId, 'a');
  assert.equal(result[1].players[0].attendanceGroupId, 'b');
  assert.equal(result[1].players[0].attendancePresentCount, 4);
  assert.equal(player.attendanceGroupId, undefined);
});
