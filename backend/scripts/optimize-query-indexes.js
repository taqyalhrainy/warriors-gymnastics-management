require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ensurePerformanceIndexes } = require('../utils/performanceIndexes');

const run = async () => {
  if (!process.env.MONGO_URI && !process.env.MONGODB_URI) throw new Error('A database URI is required.');
  await connectDB();
  try {
    await ensurePerformanceIndexes(mongoose.connection.db);
    console.log('Query indexes ready.');
  } finally {
    await mongoose.disconnect();
  }
};
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
