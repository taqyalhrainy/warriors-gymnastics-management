const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getPublicMedia, getAdminMedia, createMedia, updateMedia, deleteMedia } = require('../controllers/clubMediaController');

const router = express.Router();

router.get('/public', getPublicMedia);
router.get('/', protect, authorize('admin'), getAdminMedia);
router.post('/', protect, authorize('admin'), createMedia);
router.put('/:id', protect, authorize('admin'), updateMedia);
router.delete('/:id', protect, authorize('admin'), deleteMedia);

module.exports = router;
