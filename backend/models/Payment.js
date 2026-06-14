const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  playerNameSnapshot: { type: String, trim: true, default: '' },
  parentNameSnapshot: { type: String, trim: true, default: '' },
  packageNameSnapshot: { type: String, trim: true, default: '' },
  packageClassesSnapshot: { type: Number, default: 0 },
  packageHoursSnapshot: { type: Number, default: 0 },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['Click', 'Cash', 'Bank Transfer'], default: 'Cash' },
  receiptImage: { type: String, trim: true },
  paymentDate: { type: Date, default: Date.now },
  notesEncrypted: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date }
});

module.exports = mongoose.model('Payment', paymentSchema);
