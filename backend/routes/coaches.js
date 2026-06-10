const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getCoaches, createCoach, updateCoach, deleteCoach } = require('../controllers/coachController');

const router = express.Router();
router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getCoaches);
router.post('/', authorize('admin'), createCoach);
router.put('/:id', authorize('admin'), updateCoach);
router.delete('/:id', authorize('admin'), deleteCoach);

module.exports = router;