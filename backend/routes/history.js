const express = require('express');
const { getHistorySnapshot } = require('../controllers/historyController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getHistorySnapshot);

module.exports = router;
