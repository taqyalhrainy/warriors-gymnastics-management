const express = require('express');
const {
  markPresent,
  markAbsent,
  updateTodayAttendance,
  cancelTodayAttendance,
  getAttendanceByPlayer,
  getTodayAttendance,
  getAttendanceByGroup
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.post('/present', authorize('admin', 'coach', 'receptionist'), markPresent);
router.post('/absent', authorize('admin', 'coach', 'receptionist'), markAbsent);
router.put('/today', authorize('admin', 'coach', 'receptionist'), updateTodayAttendance);
router.delete('/today', authorize('admin', 'coach', 'receptionist'), cancelTodayAttendance);
router.get('/today', authorize('admin', 'coach', 'receptionist'), getTodayAttendance);
router.get('/player/:playerId', authorize('admin', 'coach', 'receptionist', 'parent'), getAttendanceByPlayer);
router.get('/group/:groupId', authorize('admin', 'coach', 'receptionist'), getAttendanceByGroup);

module.exports = router;
