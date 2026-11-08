const express = require('express');
const {
  getNotifications,
  getManualPlayerNotificationHistory,
  getNotificationResponses,
  getUnviewedNotificationResponseCount,
  markNotificationResponsesViewed,
  saveParentNotificationResponse,
  getNotificationById,
  getUnreadNotificationCount,
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
  getPushStatus,
  sendTestPushNotification,
  getSavedMessages,
  createSavedMessage,
  updateSavedMessage,
  deleteSavedMessage,
  createNotification,
  createPlayerNotification,
  announceAllParents,
  announceGroupParents,
  announceParentsByPlayerStatus
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getNotifications);
router.get('/count', authorize('admin', 'coach', 'receptionist', 'parent'), getUnreadNotificationCount);
router.get('/push/public-key', authorize('parent'), getPushPublicKey);
router.get('/push/status', authorize('parent'), getPushStatus);
router.post('/push/subscribe', authorize('parent'), savePushSubscription);
router.post('/push/test', authorize('parent'), sendTestPushNotification);
router.delete('/push/unsubscribe', authorize('parent'), deletePushSubscription);
router.get('/saved', authorize('admin', 'coach', 'receptionist'), getSavedMessages);
router.post('/saved', authorize('admin', 'coach', 'receptionist'), createSavedMessage);
router.put('/saved/:id', authorize('admin', 'coach', 'receptionist'), updateSavedMessage);
router.delete('/saved/:id', authorize('admin', 'coach', 'receptionist'), deleteSavedMessage);
router.get('/manual-history/:playerId', authorize('admin', 'coach', 'receptionist'), getManualPlayerNotificationHistory);
router.get('/responses/count', authorize('admin', 'coach', 'receptionist'), getUnviewedNotificationResponseCount);
router.get('/responses', authorize('admin', 'coach', 'receptionist'), getNotificationResponses);
router.post('/responses/mark-viewed', authorize('admin', 'coach', 'receptionist'), markNotificationResponsesViewed);
router.post('/player/:playerId', authorize('admin', 'coach', 'receptionist'), createPlayerNotification);
router.put('/:id/response', authorize('parent'), saveParentNotificationResponse);
router.get('/:id', authorize('admin', 'coach', 'receptionist', 'parent'), getNotificationById);
router.post('/', authorize('admin', 'coach', 'receptionist'), createNotification);
router.post('/announce-all', authorize('admin', 'coach', 'receptionist'), announceAllParents);
router.post('/announce-group', authorize('admin', 'coach', 'receptionist'), announceGroupParents);
router.post('/announce-status', authorize('admin', 'coach', 'receptionist'), announceParentsByPlayerStatus);

module.exports = router;
