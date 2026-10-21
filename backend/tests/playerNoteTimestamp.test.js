const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadResolver = (entries, onFind = () => {}) => {
  const module = { exports: {} };
  const query = {
    select() { return this; },
    sort() { return this; },
    lean() { return Promise.resolve(entries); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/playerNoteTimestamp.js'), 'utf8'), {
    module,
    require(name) {
      if (name === '../models/HistoryEntry') return { find: (filter) => { onFind(filter); return query; } };
      if (name === '../middleware/validate') return { decodeText: (value) => value };
      throw new Error(`Unexpected dependency: ${name}`);
    }
  });
  return module.exports.resolvePlayerNoteTimestamps;
};

test('legacy notes resolve only from the latest matching note change', async () => {
  const matchingDate = new Date('2026-10-20T16:45:00.000Z');
  const resolve = loadResolver([
    { entityId: 'player-1', before: { note: 'Current note' }, after: { note: 'Other note' }, changedAt: new Date('2026-10-21T10:00:00.000Z') },
    { entityId: 'player-1', before: { note: 'Old note' }, after: { note: 'Current note' }, changedAt: matchingDate }
  ]);

  const result = await resolve([{ _id: 'player-1', note: 'Current note' }]);
  assert.equal(result.get('player-1').toISOString(), matchingDate.toISOString());
});

test('players with a stored timestamp do not trigger a history query', async () => {
  let queried = false;
  const resolve = loadResolver([], () => { queried = true; });
  const storedDate = new Date('2026-10-21T10:00:00.000Z');
  const result = await resolve([{ _id: 'player-1', note: 'Current note', noteUpdatedAt: storedDate }]);
  assert.equal(result.size, 0);
  assert.equal(queried, false);
});
