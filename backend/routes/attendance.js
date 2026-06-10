const express = require('express');
const {
  markPresent,
  markAbsent,
  getAttendanceByPlayer,
  getAttendanceByGroup
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.post('/present', authorize('admin', 'coach', 'receptionist'), markPresent);
router.post('/absent', authorize('admin', 'coach', 'receptionist'), markAbsent);
router.get('/player/:playerId', authorize('admin', 'coach', 'receptionist', 'parent'), getAttendanceByPlayer);
router.get('/group/:groupId', authorize('admin', 'coach', 'receptionist'), getAttendanceByGroup);

module.exports = router;
