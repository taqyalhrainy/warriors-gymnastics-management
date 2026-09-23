import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAttendanceRecords, isAttendanceInCycle, getUnassignedAttendance } from '../src/utils/attendanceRecords.js';

test('renewal and group changes retain the recorded mark in its original group after reload', () => {
  const record = { _id: 'mark', playerId: 'student', groupId: 'old', date: '2026-09-23', status: 'present' };
  const groups = [{ _id: 'old', players: [] }, { _id: 'new', players: [{ _id: 'student', groupIds: ['new'], startDate: '2026-09-24' }] }];
  const board = attachAttendanceRecords(groups, [record]);
  assert.equal(board[0].players[0].todayAttendance, record);
  assert.equal(board[0].players[0].attendanceGroupId, 'old');
  assert.equal(board[0].presentCount, 1);
  assert.equal(board[1].players[0].todayAttendance, null);
  assert.deepEqual(attachAttendanceRecords(board, [record]), board);
  assert.equal(groups[0].players.length, 0);
});

test('cycle counters use the class date, never the time it was entered', () => {
  const record = { _id: 'mark', date: '2026-09-23T00:00:00', checkInTime: '2026-09-25T12:00:00Z' };
  assert.equal(isAttendanceInCycle(record, {}, '2026-09-23T18:00:00'), true);
  assert.equal(isAttendanceInCycle(record, {}, '2026-09-24T00:00:00'), false);
  assert.equal(isAttendanceInCycle(record, { currentSubscriptionAttendanceIds: ['mark'] }, '2026-09-24'), true);
  assert.equal(isAttendanceInCycle(record, { currentSubscriptionExcludedAttendanceIds: ['mark'] }, '2026-09-23'), false);
});

test('attendance predating the available subscription history remains visible exactly once', () => {
  const old = { _id: 'old', status: 'present' }, current = { _id: 'current', status: 'absent' };
  assert.deepEqual(getUnassignedAttendance([old, current], [current]), [old]);
  assert.deepEqual(getUnassignedAttendance([old, current], []), [old, current]);
  assert.deepEqual(getUnassignedAttendance([old, current], [old, current]), []);
});
