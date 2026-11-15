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
    { recipientUserId: 1, source: 1, createdAt: -1 },
    { playerId: 1, source: 1, createdAt: -1 },
    { createdAt: -1 }
  ],
  notificationresponses: [
    { key: { notificationId: 1 }, options: { unique: true } },
    { updatedAt: -1, _id: -1 },
    { adminViewedAt: 1, updatedAt: -1 }
  ],
  chatmessages: [
    { parentUserId: 1, createdAt: -1, _id: -1 },
    { parentUserId: 1, fromClub: 1, readAt: 1 },
    { key: { parentUserId: 1, senderUserId: 1, clientMessageId: 1 }, options: { unique: true } }
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
    for (const definition of indexes) {
      const key = definition.key || definition;
      const options = definition.key ? (definition.options || {}) : {};
      if (existing.some((index) => JSON.stringify(index.key) === JSON.stringify(key))) continue;
      await collection.createIndex(key, options);
    }
  }
};

module.exports = { ensurePerformanceIndexes, performanceIndexes };
