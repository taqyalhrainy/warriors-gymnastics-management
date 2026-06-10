const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  parentPhoneEncrypted: { type: String, required: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrainingGroup' },
  coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coach' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  level: { type: String, trim: true },
  status: { type: String, enum: ['active', 'expired', 'frozen', 'left'], default: 'active' },
  profileImage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', playerSchema);
