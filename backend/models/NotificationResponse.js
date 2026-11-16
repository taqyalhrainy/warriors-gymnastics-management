const mongoose = require('mongoose');

const notificationResponseSchema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, unique: true },
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  reply: { type: String, trim: true, maxlength: 2000, default: '' },
  reaction: { type: String, enum: ['', '👍', '❤️', '🙏', '😊', '😮', '😢'], default: '' },
  adminViewedAt: { type: Date },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

notificationResponseSchema.index({ updatedAt: -1, _id: -1 });
notificationResponseSchema.index({ adminViewedAt: 1, updatedAt: -1 });
notificationResponseSchema.index({ recipientUserId: 1, updatedAt: -1, _id: -1 });
notificationResponseSchema.index({ recipientUserId: 1, deletedAt: 1 });

module.exports = mongoose.model('NotificationResponse', notificationResponseSchema);
