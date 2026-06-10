const express = require('express');
const {
  getPlayers,
  createPlayer,
  getPlayerById,
  updatePlayer,
  deletePlayer
} = require('../controllers/playerController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist', 'parent'), getPlayers);
router.post('/', authorize('admin', 'coach', 'receptionist'), createPlayer);
router.get('/:id', authorize('admin', 'coach', 'receptionist', 'parent'), getPlayerById);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updatePlayer);
router.delete('/:id', authorize('admin'), deletePlayer);

module.exports = router;
