const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getParents,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
  getParentMe,
  getParentChildren,
  getParentAttendance,
  getParentPayments,
  getParentDashboard
} = require('../controllers/parentController');

const router = express.Router();
router.use(protect);
router.get('/me', authorize('parent'), getParentMe);
router.get('/me/dashboard', authorize('parent'), getParentDashboard);
router.get('/me/children', authorize('parent'), getParentChildren);
router.get('/me/attendance', authorize('parent'), getParentAttendance);
router.get('/me/payments', authorize('parent'), getParentPayments);
router.get('/', authorize('admin', 'coach', 'receptionist'), getParents);
router.post('/', authorize('admin'), createParent);
router.get('/:id', authorize('admin', 'coach', 'receptionist'), getParentById);
router.put('/:id', authorize('admin'), updateParent);
router.delete('/:id', authorize('admin'), deleteParent);

module.exports = router;