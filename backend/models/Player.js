const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  parentPhoneEncrypted: { type: String, required: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' },
  groupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' }],
  coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  level: { type: String, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  currentSubscriptionStartedAt: { type: Date },
  currentSubscriptionAttendanceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' }],
  packageName: { type: String, trim: true, default: '' },
  packageClasses: { type: Number, min: 0, default: 0 },
  packageHours: { type: Number, min: 0, default: 0 },
  payment: { type: Number, default: 0, min: 0 },
  previousDueBalance: { type: Number, default: 0 },
  dueAdjustment: { type: Number, default: 0, min: 0 },
  attendanceDueManual: { type: Boolean, default: false },
  note: { type: String, trim: true, default: '' },
  freezeNote: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'expired', 'frozen', 'left', 'tryout'], default: 'active' },
  showInAttendanceWhenFrozen: { type: Boolean, default: true },
  subscriptionNeedsAttention: { type: Boolean, default: false },
  attendanceAlertEnabled: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  profileImage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', playerSchema);
