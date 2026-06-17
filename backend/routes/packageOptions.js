const express = require('express');
const {
  getPackageOptions,
  createPackageOption,
  updatePackageOption,
  deletePackageOption
} = require('../controllers/packageOptionController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', authorize('admin', 'coach', 'receptionist'), getPackageOptions);
router.post('/', authorize('admin', 'coach', 'receptionist'), createPackageOption);
router.put('/:id', authorize('admin', 'coach', 'receptionist'), updatePackageOption);
router.delete('/:id', authorize('admin'), deletePackageOption);

module.exports = router;
