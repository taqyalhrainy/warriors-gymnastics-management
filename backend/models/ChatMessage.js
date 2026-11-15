const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromClub: { type: Boolean, required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  clientMessageId: { type: String, required: true, maxlength: 100 },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true }
});

chatMessageSchema.index({ parentUserId: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ parentUserId: 1, fromClub: 1, readAt: 1 });
chatMessageSchema.index({ parentUserId: 1, senderUserId: 1, clientMessageId: 1 }, { unique: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
