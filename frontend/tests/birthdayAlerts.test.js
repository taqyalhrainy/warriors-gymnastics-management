import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayDay, todaysBirthdays, markBirthdaysRead, readBirthdayIds } from '../src/utils/birthdayAlerts.js';

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
