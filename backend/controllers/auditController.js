const AuditLog = require('../models/AuditLog');

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('userId', 'name email role');
    res.json(logs);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAuditLogs };
