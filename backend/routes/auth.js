const express = require('express');
const { loginUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/login', loginUser);
router.get('/me', protect, getMe);

module.exports = router;
