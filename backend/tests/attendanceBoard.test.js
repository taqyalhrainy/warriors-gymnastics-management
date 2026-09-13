const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('batch board preserves group counters with one player query and one attendance query', async () => {
  let playerQueries = 0;
  let attendanceQueries = 0;
  const projections = [];
  const group = (id) => ({ _id: id, name: id, days: ['Monday'], toObject() { return { _id: id, name: id, days: ['Monday'] }; } });
  const groups = [group('a'), group('b')];
  const player = (id, primary, secondary) => ({
    _id: id, groupId: primary, groupIds: secondary,
    startDate: '2026-09-01', packageClasses: 8,
    currentSubscriptionAttendanceIds: ['early'], currentSubscriptionExcludedAttendanceIds: ['excluded'],
    attendanceDueManual: true, previousDueBalance: 100, dueAdjustment: 25,
    toObject() { const { toObject, ...data } = this; return data; }
  });
  const players = [player('p', 'a', ['a', 'b']), player('q', 'b', [])];
  const records = [
    { _id: 'early', playerId: 'p', date: '2026-08-01' },
    { _id: 'normal', playerId: 'p', date: '2026-09-01' },
    { _id: 'duplicate', playerId: 'p', date: '2026-09-01' },
    { _id: 'excluded', playerId: 'p', date: '2026-09-02' }
  ];
  const query = (rows) => ({ sort() { return this; }, populate() { return this; }, select() { return this; }, lean() { return Promise.resolve(rows); }, then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); } });
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/groupController.js'), 'utf8'), {
    module, console, setTimeout: () => {},
    require(name) {
      if (name === '../models/TrainingGroup') return { find: () => query(groups) };
      if (name === '../models/Player') return { find: (filter) => {
        playerQueries += 1;
        assert.equal(filter.isDeleted.$ne, true);
        assert.equal(filter.status.$ne, 'left');
        const id = filter.$or?.[0]?.groupId;
        const result = query(id ? players.filter((p) => p.groupId === id || p.groupIds.includes(id)) : players);
        result.select = function (projection) { projections.push(projection); return this; };
        return result;
      } };
      if (name === '../models/Attendance') return { find: () => { attendanceQueries += 1; return query(records); } };
      if (name === '../middleware/validate') return { decodeText: (value) => value, validateObjectId: () => true };
      return {};
    }
  });
  const invoke = async (handler, params = {}) => {
    let result;
    await handler({ params, query: { compact: 'true' } }, { json: (data) => { result = data; } }, (error) => { throw error; });
    return result;
  };
  const board = await invoke(module.exports.getAttendanceBoard);
  assert.equal(playerQueries, 1);
  assert.equal(projections[0].profileImage, 0);
  assert.equal(attendanceQueries, 1);
  assert.equal(board.players[0].attendancePresentCount, 2);
  assert.equal(board.players[0].paymentRemainingAmount, 75);
  for (const g of groups) {
    const oldRows = await invoke(module.exports.getGroupPlayers, { id: g._id });
    assert.equal(projections.at(-1).profileImage, undefined);
    const newRows = board.players.filter((p) => p.groupId === g._id || p.groupIds.includes(g._id)).map((p) => ({ ...p, attendanceGroupId: g._id }));
    assert.equal(JSON.stringify(newRows), JSON.stringify(oldRows));
  }
});
