const express = require('express');
const {
  getPushPublicKey,
  getPushStatus,
  savePushSubscription,
  deletePushSubscription
} = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/public-key', authorize('parent'), getPushPublicKey);
router.get('/status', authorize('parent'), getPushStatus);
router.post('/subscribe', authorize('parent'), savePushSubscription);
router.delete('/unsubscribe', authorize('parent'), deletePushSubscription);

module.exports = router;
