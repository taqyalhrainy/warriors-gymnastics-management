const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getDashboardReport, getRevenueReport, getAttendanceReport } = require('../controllers/reportController');
const { exportPlayersBackup } = require('../controllers/backupController');

const router = express.Router();
router.use(protect);
router.get('/dashboard', authorize('admin', 'coach', 'receptionist'), getDashboardReport);
router.get('/revenue', authorize('admin', 'coach', 'receptionist'), getRevenueReport);
router.get('/attendance', authorize('admin', 'coach', 'receptionist'), getAttendanceReport);
router.get('/players-backup', authorize('admin'), exportPlayersBackup);

module.exports = router;
