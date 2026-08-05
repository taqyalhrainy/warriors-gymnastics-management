const express = require('express');
const { getHistorySnapshot, getPlayerHistory, restoreHistorySnapshot, getSnapshotRestoreStatus } = require('../controllers/historyController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getHistorySnapshot);
router.get('/player/:playerId', authorize('admin', 'coach', 'receptionist'), getPlayerHistory);
router.post('/restore', authorize('admin'), restoreHistorySnapshot);
router.get('/restore/:jobId', authorize('admin'), getSnapshotRestoreStatus);

module.exports = router;
