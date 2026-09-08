const mongoose = require('mongoose');

const clubMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video'], required: true },
  title: { type: String, trim: true, default: '' },
  caption: { type: String, trim: true, default: '' },
  mediaUrl: { type: String, required: true, trim: true },
  thumbnailUrl: { type: String, trim: true, default: '' },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false }
}, { timestamps: true });

clubMediaSchema.index({ isActive: 1, displayOrder: 1, createdAt: -1 });

module.exports = mongoose.model('ClubMedia', clubMediaSchema);
