const isDatabaseUnavailable = (error) => (
  ['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoPoolClearedError', 'MongoNotConnectedError', 'MongoTopologyClosedError'].includes(error?.name)
  || (error?.name === 'MongoServerError' && [13, 18, 8000].includes(error.code))
  || /buffering timed out/i.test(error?.message || '')
);

// Log only fixed classifications: database errors can contain credentials or user data.
const databaseFailureReason = (error) => {
  const message = String(error?.message || '');
  if (/bad auth|authentication failed|auth failed/i.test(message)) return 'authentication-failed';
  if (/space quota|storage quota|storage limit|disk.*full|quota.*(?:space|storage)|over.*quota/i.test(message)) return 'storage-quota';
  if (/rate limit|too many requests|throttl|transfer.*limit|bandwidth/i.test(message)) return 'rate-or-transfer-limit';
  if (/too many connections|connection.*limit/i.test(message)) return 'connection-limit';
  if (/not authorized|unauthorized|permission/i.test(message)) return 'authorization-failed';
  if (/read.only|not writable|not primary|not master/i.test(message)) return 'not-writable';
  if (/timed? ?out|timeout/i.test(message)) return 'timeout';
  return 'unclassified';
};

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

module.exports = { isDatabaseUnavailable, databaseHealth, databaseFailureReason };
