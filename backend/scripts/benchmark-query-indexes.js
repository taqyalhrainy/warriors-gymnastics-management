require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { ensurePerformanceIndexes } = require('../utils/performanceIndexes');

const run = async () => {
  if (!process.env.MONGO_URI && !process.env.MONGODB_URI) throw new Error('A database URI is required.');
  await connectDB();
  try {
    const db = mongoose.connection.db;
    const player = await db.collection('players').findOne({}, { projection: { parentId: 1 } });
    const notification = await db.collection('notifications').findOne({}, { projection: { recipientUserId: 1 } });
    const probes = [
      ['players', { parentId: player?.parentId }, { createdAt: -1, _id: -1 }, 0],
      ['payments', { playerId: player?._id }, { paymentDate: -1, _id: -1 }, 0],
      ['notifications', { recipientUserId: notification?.recipientUserId }, { createdAt: -1 }, 10]
    ];
    const measure = async (label) => {
      for (const [name, filter, sort, limit] of probes) {
        const { executionStats: stats } = await db.collection(name).find(filter).sort(sort).limit(limit).explain('executionStats');
        console.log(JSON.stringify({ label, collection: name, examined: stats.totalDocsExamined, returned: stats.nReturned, ms: stats.executionTimeMillis }));
      }
    };
    await measure('before');
    await ensurePerformanceIndexes(db);
    await measure('after');
  } finally {
    await mongoose.disconnect();
  }
};
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
