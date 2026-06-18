const mongoose = require('mongoose');

const waitingListEntrySchema = new mongoose.Schema({
  playerName: { type: String, required: true, trim: true },
  playerAge: { type: Number, min: 0, max: 120 },
  parentName: { type: String, required: true, trim: true },
  parentPhone: { type: String, required: true, trim: true },
  desiredGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contactedAt: { type: Date },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

waitingListEntrySchema.index({ createdAt: -1 });
waitingListEntrySchema.index({ desiredGroupId: 1 });

module.exports = mongoose.model('WaitingListEntry', waitingListEntrySchema);
