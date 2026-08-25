const mongoose = require('mongoose');

const coachSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  phone2: { type: String, trim: true },
  specialization: { type: String, trim: true }
});

module.exports = mongoose.model('Coach', coachSchema);
