import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceCycleStart, countAttendanceForCycle, packageCounter, mergeCurrentAttendanceState, isAttendanceSubscriptionExpired } from '../src/utils/attendanceRecords.js';

const player = { _id: 'a', status: 'active', startDate: '2026-08-01', currentSubscriptionStartedAt: '2026-09-20',
  endDate: '2026-10-20', packageClasses: 8,
  subscriptionId: { startDate: '2026-08-01', endDate: '2026-08-31', totalSessions: 12, usedSessions: 8 } };
const records = [1, 2, 3, 4, 5, 20, 21, 22].map((date) => ({
  _id: `r${date}`, playerId: 'a', status: 'present', date: `2026-09-${String(date).padStart(2, '0')}`
}));

test('opening or refreshing a renewed player stays 3/8 and does not revive old expiry', () => {
  const attendancePresentCount = countAttendanceForCycle(records, player);
  assert.equal(attendanceCycleStart(player), '2026-09-20');
  assert.equal(attendancePresentCount, 3);
  const current = { ...player, attendancePresentCount };
  assert.deepEqual(packageCounter(current), { used: 3, total: 8 });
  assert.equal(isAttendanceSubscriptionExpired(current, new Date('2026-09-29T12:00:00Z')), false);
  assert.equal(countAttendanceForCycle(records, current), 3);
});

test('historical group views retain current cycle fields and cannot restore the previous counter', () => {
  const snapshot = { ...player, groupIds: ['old'], currentSubscriptionStartedAt: '2026-08-01', attendancePresentCount: 8, status: 'expired' };
  const current = { ...player, groupIds: ['new'], attendancePresentCount: 3 };
  const historical = mergeCurrentAttendanceState(snapshot, current);
  assert.equal(countAttendanceForCycle(records, historical), 3);
  assert.deepEqual(historical.groupIds, ['old']);
  assert.equal(isAttendanceSubscriptionExpired(historical, new Date('2026-09-29')), false);
});

test('counts are per player and unique class date, with explicit inclusion and exclusion', () => {
  const changed = { ...player, currentSubscriptionAttendanceIds: ['r1'], currentSubscriptionExcludedAttendanceIds: ['r20'] };
  const mixed = [...records, { ...records[6], _id: 'duplicate', groupId: 'second' },
    { ...records[0], _id: 'other', playerId: 'b', date: '2026-09-23' }];
  assert.equal(countAttendanceForCycle(mixed, changed), 3);
  assert.equal(countAttendanceForCycle(mixed, { ...changed, _id: 'b', currentSubscriptionAttendanceIds: [] }), 1);
  assert.equal(countAttendanceForCycle(records, { _id: 'a', packageClasses: 8 }), 8);
  assert.equal(countAttendanceForCycle([], player), 0);
});

test('genuine exhausted, expired and frozen subscriptions keep their intended badges', () => {
  const now = new Date('2026-09-29');
  assert.equal(isAttendanceSubscriptionExpired({ ...player, attendancePresentCount: 8 }, now), true);
  assert.equal(isAttendanceSubscriptionExpired({ ...player, endDate: '2026-09-28', attendancePresentCount: 3 }, now), true);
  assert.equal(isAttendanceSubscriptionExpired({ ...player, status: 'frozen', attendancePresentCount: 8 }, now), false);
});
