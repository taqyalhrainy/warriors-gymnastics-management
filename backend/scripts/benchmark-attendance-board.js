require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const run = async () => {
  if (!process.env.MONGO_URI && !process.env.MONGODB_URI) throw new Error('A database URI is required.');
  await connectDB();
  try {
    const filename = path.join(__dirname, '../controllers/groupController.js');
    const module = { exports: {} };
    // Measure reads only; do not schedule the controller's maintenance writes.
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, require: createRequire(filename), console, setTimeout: () => {}
    });
    const invoke = async (handler, params = {}) => {
      let data;
      await handler({ params, query: { compact: 'true' } }, { json: (value) => { data = value; } }, (error) => { throw error; });
      return data;
    };
    let start = performance.now();
    const groups = await invoke(module.exports.getGroups);
    const oldPlayers = await Promise.all(groups.map((g) => invoke(module.exports.getGroupPlayers, { id: String(g._id) })));
    const beforeMs = Math.round(performance.now() - start);
    start = performance.now();
    const board = await invoke(module.exports.getAttendanceBoard);
    const afterMs = Math.round(performance.now() - start);
    const id = (value) => String(value?._id || value || '');
    const summary = (players) => players.map((p) => [id(p), p.attendancePresentCount, p.paymentRemainingAmount]).sort();
    for (let i = 0; i < groups.length; i++) {
      const groupId = id(groups[i]);
      const rows = board.players.filter((p) => [p.groupId, ...(p.groupIds || [])].some((g) => id(g) === groupId));
      if (JSON.stringify(summary(rows)) !== JSON.stringify(summary(oldPlayers[i]))) throw new Error('Board counters differ.');
    }
    console.log(JSON.stringify({ beforeRequests: groups.length + 1, afterRequests: 1, beforeMs, afterMs,
      beforeBytes: Buffer.byteLength(JSON.stringify(groups)) + oldPlayers.reduce((sum, rows) => sum + Buffer.byteLength(JSON.stringify(rows)), 0),
      afterBytes: Buffer.byteLength(JSON.stringify(board)), countersMatch: true }));
    const { gzipSync } = require('node:zlib');
    const candidates = await mongoose.connection.collection('players').find({ isDeleted: { $ne: true }, status: 'active', endDate: { $ne: null } }, { projection: { _id: 1, status: 1, endDate: 1 } }).toArray();
    console.log(JSON.stringify({ boardRawBytes: Buffer.byteLength(JSON.stringify(board)), boardGzipBytes: gzipSync(JSON.stringify(board), { level: 1 }).length, alertCandidateBytes: Buffer.byteLength(JSON.stringify(candidates)) }));
  } finally {
    await mongoose.disconnect();
  }
};
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
