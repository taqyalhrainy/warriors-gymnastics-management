const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getDashboardReport, getRevenueReport, getAttendanceReport } = require('../controllers/reportController');

const router = express.Router();
router.use(protect);
router.get('/dashboard', authorize('admin', 'coach', 'receptionist'), getDashboardReport);
router.get('/revenue', authorize('admin', 'coach', 'receptionist'), getRevenueReport);
router.get('/attendance', authorize('admin', 'coach', 'receptionist'), getAttendanceReport);

module.exports = router;
