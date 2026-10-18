const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  loginNameKey: { type: String, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  recoveryCodeHash: { type: String, select: false, unique: true, sparse: true },
  sessionVersion: { type: Number, default: 0 },
  role: { type: String, enum: ['admin', 'coach', 'receptionist', 'parent'], default: 'parent' },
  phone: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.index({ role: 1, loginNameKey: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);
