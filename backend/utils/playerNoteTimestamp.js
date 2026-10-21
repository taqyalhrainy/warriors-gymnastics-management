const HistoryEntry = require('../models/HistoryEntry');
const { decodeText } = require('../middleware/validate');

const normalizeNote = (value) => decodeText(String(value || '')).trim();

const resolvePlayerNoteTimestamps = async (players = []) => {
  const unresolvedNotes = new Map();

  players.forEach((player) => {
    if (!player?._id || player.noteUpdatedAt || !normalizeNote(player.note)) return;
    unresolvedNotes.set(String(player._id), normalizeNote(player.note));
  });

  if (!unresolvedNotes.size) return new Map();

  const entries = await HistoryEntry.find({
    entityType: 'player',
    entityId: { $in: [...unresolvedNotes.keys()] },
    changedFields: 'note'
  })
    .select('entityId before after changedAt')
    .sort({ changedAt: -1 })
    .lean();

  const resolved = new Map();
  entries.forEach((entry) => {
    const playerId = String(entry.entityId);
    if (resolved.has(playerId)) return;

    const currentNote = unresolvedNotes.get(playerId);
    const beforeNote = normalizeNote(entry.before?.note);
    const afterNote = normalizeNote(entry.after?.note);
    if (currentNote && afterNote === currentNote && beforeNote !== afterNote && entry.changedAt) {
      resolved.set(playerId, entry.changedAt);
    }
  });

  return resolved;
};

module.exports = { resolvePlayerNoteTimestamps };
