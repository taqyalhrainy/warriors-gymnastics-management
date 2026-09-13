const performanceIndexes = {
  players: [
    { parentId: 1, createdAt: -1, _id: -1 },
    { groupId: 1 },
    { groupIds: 1 }
  ],
  payments: [
    { playerId: 1, paymentDate: -1, _id: -1 },
    { paymentDate: -1, _id: -1 }
  ],
  notifications: [
    { recipientUserId: 1, createdAt: -1 },
    { recipientUserId: 1, isRead: 1 },
    { createdAt: -1 }
  ],
  attendances: [{ date: -1, _id: -1 }],
  parents: [{ userId: 1 }],
  historyentries: [{ entityType: 1, entityId: 1, changedAt: 1 }]
};

// Add only missing query indexes; never drop or rebuild existing indexes.
const ensurePerformanceIndexes = async (db) => {
  for (const [name, indexes] of Object.entries(performanceIndexes)) {
    const collection = db.collection(name);
    const existing = await collection.indexes().catch((error) => {
      if (error.code === 26) return [];
      throw error;
    });
    for (const key of indexes) {
      if (existing.some((index) => JSON.stringify(index.key) === JSON.stringify(key))) continue;
      await collection.createIndex(key);
    }
  }
};

module.exports = { ensurePerformanceIndexes, performanceIndexes };
