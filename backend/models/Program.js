const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  level: { type: String, trim: true },
  price: { type: Number, default: 0 },
  duration: { type: String, trim: true },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Program', programSchema);
