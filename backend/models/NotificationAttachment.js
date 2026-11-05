const mongoose = require('mongoose');

const notificationAttachmentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['image'], default: 'image' },
  dataUrl: { type: String, required: true, select: false },
  mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
  fileName: { type: String, trim: true, maxlength: 120 },
  byteLength: { type: Number, required: true, min: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('NotificationAttachment', notificationAttachmentSchema);
