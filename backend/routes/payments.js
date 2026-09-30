const express = require('express');
const { getPayments, createPayment, updatePayment, deletePayment, getPaymentsByPlayer } = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');
const { parentScope } = require('../middleware/parentScope');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), parentScope, getPayments);
router.post('/', authorize('admin', 'coach', 'receptionist'), createPayment);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updatePayment);
router.delete('/:id', authorize('admin', 'coach', 'receptionist'), deletePayment);
router.get('/player/:playerId', authorize('admin', 'coach', 'receptionist', 'parent'), parentScope, getPaymentsByPlayer);

module.exports = router;
