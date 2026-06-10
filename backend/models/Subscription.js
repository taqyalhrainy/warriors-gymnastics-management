const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  type: { type: String, enum: ['sessions', 'time'], required: true },
  packageName: { type: String, trim: true },
  totalSessions: { type: Number, default: 0 },
  usedSessions: { type: Number, default: 0 },
  remainingSessions: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  price: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'expired', 'almost_expired'], default: 'active' },
  lastAttendanceDate: { type: Date }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
