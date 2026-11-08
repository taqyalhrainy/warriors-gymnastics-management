import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification admin page exposes manual player history and dated response inbox', () => {
  const source = read('src/pages/Notifications.jsx');
  assert.match(source, /Player message history/);
  assert.match(source, /fetchManualPlayerNotificationHistory/);
  assert.match(source, /Parent replies & reactions/);
  assert.match(source, /fetchNotificationResponses\(\{ date: responsesDate/);
  assert.match(source, /Open original message/);
});

test('both parent notification detail routes support replies and reactions', () => {
  const composer = read('src/components/ParentNotificationResponse.jsx');
  assert.match(composer, /saveNotificationResponse/);
  assert.match(composer, /const reactions = \['👍', '❤️', '🙏', '😊', '😮', '😢'\]/);
  for (const file of ['src/pages/ParentNotificationDetail.jsx', 'src/pages/NotificationDetail.jsx']) {
    assert.match(read(file), /ParentNotificationResponse/);
  }
});

test('subscription history treats a player edit as moving the current cycle instead of creating another cycle', () => {
  const source = read('src/pages/Attendance.jsx');
  assert.match(source, /const startsNewSubscription = entry\.source === 'new-subscription'/);
  assert.match(source, /const editedCycleIndex = cycles\.findIndex/);
});
