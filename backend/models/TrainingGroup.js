const mongoose = require('mongoose');

const trainingGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  days: [{ type: String, required: true }],
  startTime: { type: String, required: true, trim: true },
  endTime: { type: String, required: true, trim: true },
  coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  maxCapacity: { type: Number, required: true, default: 20 },
  currentCount: { type: Number, default: 0 },
  color: { type: String, default: '#2563eb', trim: true },
  displayOrder: { type: Number, default: 0 },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' }
});

module.exports = mongoose.model('TrainingGroup', trainingGroupSchema);
