const mongoose = require('mongoose');

const waitingListEntrySchema = new mongoose.Schema({
  playerName: { type: String, trim: true, default: '' },
  playerAge: { type: Number, min: 0, max: 120 },
  parentName: { type: String, trim: true, default: '' },
  parentPhone: { type: String, trim: true, default: '' },
  desiredGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' },
  desiredGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactedAt: { type: Date },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

waitingListEntrySchema.index({ createdAt: 1 });
waitingListEntrySchema.index({ desiredGroupId: 1 });
waitingListEntrySchema.index({ desiredGroupIds: 1 });

module.exports = mongoose.model('WaitingListEntry', waitingListEntrySchema);
