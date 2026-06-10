const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  name: { type: String, required: true, trim: true },
  phoneEncrypted: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }]
});

module.exports = mongoose.model('Parent', parentSchema);
