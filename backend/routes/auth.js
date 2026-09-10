const express = require('express');
const { loginUser, getMe } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { recoveryLimit, changePassword, resetPassword } = require('../controllers/adminRecoveryController');

const router = express.Router();

router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/admin/reset-password', recoveryLimit, resetPassword);
router.post('/admin/change-password', protect, authorize('admin'), recoveryLimit, changePassword);

module.exports = router;
