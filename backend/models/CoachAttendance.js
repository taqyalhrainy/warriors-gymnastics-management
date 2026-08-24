const mongoose = require('mongoose');

const coachAttendanceSchema = new mongoose.Schema({
  coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'left', 'absent'], required: true },
  arrivedAt: { type: Date },
  leftAt: { type: Date },
  absentAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

coachAttendanceSchema.index({ coachId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('CoachAttendance', coachAttendanceSchema);
