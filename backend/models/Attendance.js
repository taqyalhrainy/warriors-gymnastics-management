const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup', required: true },
  date: { type: Date, required: true },
  checkInTime: { type: Date },
  status: { type: String, enum: ['present', 'absent'], required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

attendanceSchema.index({ playerId: 1, groupId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
