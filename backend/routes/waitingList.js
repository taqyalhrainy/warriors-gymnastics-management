const express = require('express');
const {
  getWaitingListEntries,
  createWaitingListEntry,
  updateWaitingListEntry,
  deleteWaitingListEntry
} = require('../controllers/waitingListController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getWaitingListEntries);
router.post('/', authorize('admin', 'coach', 'receptionist'), createWaitingListEntry);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updateWaitingListEntry);
router.delete('/:id', authorize('admin', 'coach', 'receptionist'), deleteWaitingListEntry);

module.exports = router;
