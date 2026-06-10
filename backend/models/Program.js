const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  level: { type: String, trim: true }
});

module.exports = mongoose.model('Program', programSchema);
