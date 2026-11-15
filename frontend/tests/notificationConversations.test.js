import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification admin page exposes manual history and opens the two-way chat with dated messages', () => {
  const source = read('src/pages/Notifications.jsx');
  assert.match(source, /Player message history/);
  assert.match(source, /fetchManualPlayerNotificationHistory/);
  assert.match(source, /to="\/chat"/);
  assert.match(source, /useChatUnreadCount/);
  const chat = read('src/components/ChatWorkspace.jsx');
  assert.match(chat, /type="date"/);
  assert.match(chat, /originalNotification/);
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
