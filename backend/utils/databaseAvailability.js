const isDatabaseUnavailable = (error) => (
  ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoPoolClearedError', 'MongoNotConnectedError', 'MongoTopologyClosedError'].includes(error?.name)
  || (error?.name === 'MongoServerError' && [13, 18, 8000].includes(error.code))
  || /buffering timed out/i.test(error?.message || '')
);

const databaseHealth = (connection, isReady) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!isReady() || connection.readyState !== 1 || !connection.db) throw new Error('Database unavailable');
    // An open pool can outlive a password change; verify a real database operation.
    await connection.db.admin().command({ ping: 1 }, { maxTimeMS: 3000 });
    return res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch {
    return res.status(503).json({ status: 'unavailable', database: 'unavailable', time: new Date().toISOString() });
  }
};

module.exports = { isDatabaseUnavailable, databaseHealth };
