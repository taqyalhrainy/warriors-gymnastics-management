import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('admin notification form supports a compressed optional image attachment', () => {
  const source = read('src/pages/Notifications.jsx');
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /compressProfileImage\(file, \{ maxSide: 1280, quality: 0\.78 \}\)/);
  assert.match(source, /\.\.\.\(attachment && \{ attachment \}\)/);
});

test('both parent and shared notification details render the stored image', () => {
  for (const file of ['src/pages/ParentNotificationDetail.jsx', 'src/pages/NotificationDetail.jsx']) {
    const source = read(file);
    assert.match(source, /notification\.attachment\?\.kind === 'image'/);
    assert.match(source, /className="notification-attachment-view"/);
  }
});
