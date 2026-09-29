const test = require('node:test');
const assert = require('node:assert/strict');
const { getAppDateKey, dateKeyToUtc, getAppDateOnly, getAppDayRangeUtc } = require('../utils/appDate');

test('club date follows Amman across the UTC midnight boundary', () => {
  assert.equal(getAppDateKey('2026-09-28T21:30:00.000Z'), '2026-09-29');
  assert.equal(getAppDateKey('2026-09-29T20:59:59.000Z'), '2026-09-29');
  assert.equal(getAppDateKey('2026-09-29T21:00:00.000Z'), '2026-09-30');
  assert.equal(dateKeyToUtc('2026-09-29').toISOString(), '2026-09-29T00:00:00.000Z');
  assert.equal(getAppDateOnly('2026-09-19T21:00:00.000Z').toISOString(), '2026-09-20T00:00:00.000Z');
  const range = getAppDayRangeUtc('2026-09-29');
  assert.equal(range.start.toISOString(), '2026-09-28T21:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-29T21:00:00.000Z');
});
