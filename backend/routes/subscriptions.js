const express = require('express');
const { getSubscriptions, createSubscription, updateSubscription, deleteSubscription } = require('../controllers/subscriptionController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getSubscriptions);
router.post('/', authorize('admin', 'coach', 'receptionist'), createSubscription);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updateSubscription);
router.delete('/:id', authorize('admin', 'coach', 'receptionist'), deleteSubscription);

module.exports = router;
