const mongoose = require('mongoose');

const packageOptionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  classes: { type: Number, min: 0, default: 0 },
  hours: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PackageOption', packageOptionSchema);
