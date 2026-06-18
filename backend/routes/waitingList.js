const express = require('express');
const {
  getWaitingListEntries,
  createWaitingListEntry,
  deleteWaitingListEntry
} = require('../controllers/waitingListController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getWaitingListEntries);
router.post('/', authorize('admin', 'coach', 'receptionist'), createWaitingListEntry);
router.delete('/:id', authorize('admin', 'coach', 'receptionist'), deleteWaitingListEntry);

module.exports = router;
