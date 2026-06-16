const mongoose = require('mongoose');

const historyEntrySchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['player', 'payment'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['create', 'update', 'delete'],
    required: true
  },
  before: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  after: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  changedFields: {
    type: [String],
    default: []
  },
  changedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
}, {
  versionKey: false
});

historyEntrySchema.index({ entityType: 1, changedAt: -1, entityId: 1 });

module.exports = mongoose.model('HistoryEntry', historyEntrySchema);
