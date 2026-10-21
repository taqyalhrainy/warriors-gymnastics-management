import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlayerNoteTimestamp } from '../src/utils/playerNoteTimestamp.js';

test('player note timestamp includes the Jordan date and time', () => {
  const formatted = formatPlayerNoteTimestamp('2026-10-20T16:45:00.000Z', 'en', 'Unavailable');
  assert.match(formatted, /20\/10\/2026/);
  assert.match(formatted, /19:45/);
});

test('old notes without history show an explicit fallback', () => {
  assert.equal(formatPlayerNoteTimestamp(null, 'en', 'Old note'), 'Old note');
  assert.equal(formatPlayerNoteTimestamp('invalid', 'en', 'Old note'), 'Old note');
});
