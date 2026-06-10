const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { getPrograms, createProgram, updateProgram, deleteProgram } = require('../controllers/programController');

const router = express.Router();
router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getPrograms);
router.post('/', authorize('admin'), createProgram);
router.put('/:id', authorize('admin'), updateProgram);
router.delete('/:id', authorize('admin'), deleteProgram);

module.exports = router;