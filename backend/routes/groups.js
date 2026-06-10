const express = require('express');
const {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupPlayers
} = require('../controllers/groupController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getGroups);
router.post('/', authorize('admin', 'coach', 'receptionist'), createGroup);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updateGroup);
router.delete('/:id', authorize('admin'), deleteGroup);
router.get('/:id/players', authorize('admin', 'coach', 'receptionist', 'parent'), getGroupPlayers);

module.exports = router;
