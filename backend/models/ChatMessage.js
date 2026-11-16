const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromClub: { type: Boolean, required: true },
  text: { type: String, default: '', required() { return !this.attachment; }, trim: true, maxlength: 2000 },
  attachment: { type: new mongoose.Schema({
    kind: { type: String, enum: ['image', 'audio', 'video'], required: true },
    mimeType: { type: String, required: true }, fileName: String, byteLength: Number,
    checksum: { type: String, required: true, select: false },
    data: { type: Buffer, required: true, select: false }
  }, { _id: false }), default: undefined },
  clientMessageId: { type: String, required: true, maxlength: 100 },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true }
});

chatMessageSchema.index({ parentUserId: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ parentUserId: 1, fromClub: 1, readAt: 1 });
chatMessageSchema.index({ parentUserId: 1, senderUserId: 1, clientMessageId: 1 }, { unique: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
