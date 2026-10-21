import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayDay, todaysBirthdays, upcomingBirthdays, birthdayAlertDay, markBirthdaysRead, readBirthdayIds } from '../src/utils/birthdayAlerts.js';

test('birthdays follow Jordan midnight and do not depend on subscription expiration', () => {
  assert.equal(birthdayDay(new Date('2026-09-28T21:05:00Z')), '2026-09-29');
  const rows = [
    { _id: '1', fullName: 'A', status: 'expired', dateOfBirth: '2014-09-29T00:00:00.000Z' },
    { _id: '2', fullName: 'B', status: 'active', dateOfBirth: '2015-09-28' },
    { _id: '3', fullName: 'C', status: 'left', dateOfBirth: '2014-09-29' },
    { _id: '4', fullName: 'D', isDeleted: true, dateOfBirth: '2014-09-29' },
    { _id: '5', fullName: 'E', dateOfBirth: null }
  ];
  assert.deepEqual(todaysBirthdays(rows, '2026-09-29').map((p) => p._id), ['1']);
});

test('opening birthdays acknowledges only this user, day and displayed students', () => {
  const storage = new Map();
  globalThis.localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  globalThis.window = new EventTarget();
  try {
    markBirthdaysRead('admin1', '2026-09-29', [{ _id: 'student1' }]);
    assert.deepEqual(readBirthdayIds('admin1', '2026-09-29'), ['student1']);
    assert.deepEqual(readBirthdayIds('admin2', '2026-09-29'), []);
    assert.deepEqual(readBirthdayIds('admin1', '2027-09-29'), []);
    assert.equal(readBirthdayIds('admin1', '2026-09-29').includes('student2'), false);
  } finally { delete globalThis.localStorage; delete globalThis.window; }
});

test('date selection finds birthdays in other months and years, including leap day', () => {
  const players = [{ _id: 'a', fullName: 'A', dateOfBirth: '2012-02-29' }, { _id: 'b', fullName: 'B', dateOfBirth: '2014-12-10' }];
  assert.deepEqual(todaysBirthdays(players, '2028-02-29').map((p) => p._id), ['a']);
  assert.deepEqual(todaysBirthdays(players, '2026-12-10').map((p) => p._id), ['b']);
  assert.deepEqual(todaysBirthdays(players, '2010-12-10'), []);
});

test('birthday alert starts two days before and ends after the birthday day', () => {
  const players = [
    { _id: 'today', fullName: 'Today', dateOfBirth: '2014-10-21' },
    { _id: 'tomorrow', fullName: 'Tomorrow', dateOfBirth: '2014-10-22' },
    { _id: 'two-days', fullName: 'Two Days', dateOfBirth: '2014-10-23' },
    { _id: 'later', fullName: 'Later', dateOfBirth: '2014-10-24' }
  ];
  assert.deepEqual(upcomingBirthdays(players, '2026-10-21').map((player) => player._id), ['today', 'tomorrow', 'two-days']);
  assert.equal(birthdayAlertDay(players[2], '2026-10-21'), '2026-10-23');
  assert.deepEqual(upcomingBirthdays(players, '2026-10-24').map((player) => player._id), ['later']);
});

test('birthday alert window works across the end of the year', () => {
  const players = [
    { _id: 'new-year', fullName: 'New Year', dateOfBirth: '2014-01-01' },
    { _id: 'jan-two', fullName: 'Jan Two', dateOfBirth: '2014-01-02' }
  ];
  assert.deepEqual(upcomingBirthdays(players, '2026-12-30').map((player) => player._id), ['new-year']);
  assert.deepEqual(upcomingBirthdays(players, '2026-12-31').map((player) => player._id), ['new-year', 'jan-two']);
});
