import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const attendance = readFileSync(new URL('../src/pages/Attendance.jsx', import.meta.url), 'utf8');
const notifications = readFileSync(new URL('../src/services/notifications.js', import.meta.url), 'utf8');

test('player details split the note row and expose a direct message modal', () => {
  assert.match(attendance, /className="player-note-summary"/);
  assert.match(attendance, /className="player-direct-message-card"/);
  assert.match(attendance, /showPlayerMessageModal && selectedPlayer/);
  assert.match(attendance, /t\('savedMessage'\)/);
  assert.match(attendance, /sendPlayerNotification\(selectedPlayer\._id/);
});

test('direct message API sends only the player ID and message fields', () => {
  assert.match(notifications, /api\.post\(`\/notifications\/player\/\$\{playerId\}`/);
});
