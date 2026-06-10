const express = require('express');
const { getPayments, createPayment, getPaymentsByPlayer } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getPayments);
router.post('/', authorize('admin', 'coach', 'receptionist'), createPayment);
router.get('/player/:playerId', authorize('admin', 'coach', 'receptionist', 'parent'), getPaymentsByPlayer);

module.exports = router;
