const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, trim: true },
  source: { type: String, enum: ['manual', 'system'] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationAttachment' },
  isRead: { type: Boolean, default: false },
  viewedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ recipientUserId: 1, source: 1, createdAt: -1 });
notificationSchema.index({ playerId: 1, source: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
