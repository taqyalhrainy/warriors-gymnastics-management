const express = require('express');
const {
  getNotifications,
  getNotificationById,
  getUnreadNotificationCount,
  getPushPublicKey,
  savePushSubscription,
  getSavedMessages,
  createSavedMessage,
  updateSavedMessage,
  deleteSavedMessage,
  createNotification,
  announceAllParents,
  announceGroupParents
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getNotifications);
router.get('/count', authorize('admin', 'coach', 'receptionist', 'parent'), getUnreadNotificationCount);
router.get('/push/public-key', authorize('parent'), getPushPublicKey);
router.post('/push/subscribe', authorize('parent'), savePushSubscription);
router.get('/saved', authorize('admin', 'coach', 'receptionist'), getSavedMessages);
router.post('/saved', authorize('admin', 'coach', 'receptionist'), createSavedMessage);
router.put('/saved/:id', authorize('admin', 'coach', 'receptionist'), updateSavedMessage);
router.delete('/saved/:id', authorize('admin', 'coach', 'receptionist'), deleteSavedMessage);
router.get('/:id', authorize('admin', 'coach', 'receptionist', 'parent'), getNotificationById);
router.post('/', authorize('admin', 'coach', 'receptionist'), createNotification);
router.post('/announce-all', authorize('admin', 'coach', 'receptionist'), announceAllParents);
router.post('/announce-group', authorize('admin', 'coach', 'receptionist'), announceGroupParents);

module.exports = router;
