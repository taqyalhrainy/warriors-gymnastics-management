const mongoose = require('mongoose');

const nativePushTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['android'], default: 'android', index: true },
  deviceId: { type: String, trim: true, index: true },
  sessionId: { type: String, trim: true },
  transportVersion: { type: Number, default: 1 },
  appVersion: { type: String, trim: true },
  userAgent: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NativePushToken', nativePushTokenSchema);
