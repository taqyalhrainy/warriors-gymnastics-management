import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Data tab creates entries directly in Data instead of forcing Waiting first', () => {
  const players = source('../src/pages/Players.jsx');
  assert.match(players, /createWaitingListEntry\(\{ \.\.\.waitingForm, listType: waitingView \}\)/);
  assert.match(players, /waitingView === 'data' \? 'Save to Data' : 'Save to waiting list'/);
});

test('both player editors persist custom subscription schedule fields', () => {
  const attendance = source('../src/pages/Attendance.jsx');
  const playerForm = source('../src/pages/PlayerForm.jsx');
  for (const contents of [attendance, playerForm]) {
    assert.match(contents, /subscriptionScheduleMode/);
    assert.match(contents, /subscriptionCustomDays/);
    assert.match(contents, /Custom days/);
  }
  assert.match(attendance, /subscriptionCustomDays: subscriptionForm\.scheduleMode === 'custom' \? subscriptionForm\.customDays : \[\]/);
});

