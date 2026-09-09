const express = require('express');
const {
  getPushPublicKey,
  getPushStatus,
  savePushSubscription,
  deletePushSubscription,
  sendTestPushNotification,
  getNativePushStatus,
  saveNativePushToken,
  deleteNativePushToken,
  sendNativeTestPushNotification
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/public-key', authorize('parent'), getPushPublicKey);
router.get('/status', authorize('parent'), getPushStatus);
router.post('/subscribe', authorize('parent'), savePushSubscription);
router.post('/test', authorize('parent'), sendTestPushNotification);
router.delete('/unsubscribe', authorize('parent'), deletePushSubscription);
router.get('/native/status', authorize('parent'), getNativePushStatus);
router.post('/native/subscribe', authorize('parent'), saveNativePushToken);
router.post('/native/test', authorize('parent'), sendNativeTestPushNotification);
router.delete('/native/unsubscribe', authorize('parent'), deleteNativePushToken);

module.exports = router;
