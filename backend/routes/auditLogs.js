const express = require('express');
const { getAuditLogs } = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getAuditLogs);

module.exports = router;
