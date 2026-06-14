const express = require('express');
const { getNotifications, getNotificationById, getUnreadNotificationCount, createNotification, announceAllParents, announceGroupParents } = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getNotifications);
router.get('/count', authorize('admin', 'coach', 'receptionist', 'parent'), getUnreadNotificationCount);
router.get('/:id', authorize('admin', 'coach', 'receptionist', 'parent'), getNotificationById);
router.post('/', authorize('admin', 'coach', 'receptionist'), createNotification);
router.post('/announce-all', authorize('admin', 'coach', 'receptionist'), announceAllParents);
router.post('/announce-group', authorize('admin', 'coach', 'receptionist'), announceGroupParents);

module.exports = router;
