const mongoose = require('mongoose');

const waitingListEntrySchema = new mongoose.Schema({
  playerName: { type: String, trim: true, default: '' },
  playerAge: { type: String, trim: true, default: '' },
  parentName: { type: String, trim: true, default: '' },
  parentPhone: { type: String, trim: true, default: '' },
  desiredGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' },
  desiredGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' }],
  listType: { type: String, enum: ['waiting', 'data'], default: 'waiting' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactedAt: { type: Date },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

waitingListEntrySchema.index({ createdAt: 1 });
waitingListEntrySchema.index({ desiredGroupId: 1 });
waitingListEntrySchema.index({ desiredGroupIds: 1 });
waitingListEntrySchema.index({ listType: 1, createdAt: 1 });

module.exports = mongoose.model('WaitingListEntry', waitingListEntrySchema);
