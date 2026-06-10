const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ userId, action, entity, entityId, req }) => {
  try {
    await AuditLog.create({
      userId,
      action,
      entity,
      entityId,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (error) {
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };
