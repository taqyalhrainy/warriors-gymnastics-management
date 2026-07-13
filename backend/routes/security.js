const express = require('express');
const { updatePaymentPassword, verifyPaymentPassword } = require('../controllers/securityController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.post('/payment-password/verify', authorize('admin', 'coach', 'receptionist'), verifyPaymentPassword);
router.put('/payment-password', authorize('admin'), updatePaymentPassword);

module.exports = router;
