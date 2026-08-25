const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getCoaches, getCoachById, createCoach, updateCoach, deleteCoach, updateCoachAttendance } = require('../controllers/coachController');

const router = express.Router();
router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getCoaches);
router.get('/:id', authorize('admin', 'coach', 'receptionist'), getCoachById);
router.post('/', authorize('admin'), createCoach);
router.post('/:id/attendance', authorize('admin', 'coach', 'receptionist'), updateCoachAttendance);
router.put('/:id', authorize('admin'), updateCoach);
router.delete('/:id', authorize('admin'), deleteCoach);

module.exports = router;
