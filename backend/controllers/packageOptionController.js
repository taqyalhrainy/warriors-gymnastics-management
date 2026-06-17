const PackageOption = require('../models/PackageOption');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { parseLocalizedNumber } = require('../utils/numberInput');

const defaultPackageOptions = [
  { name: '8 classes (1 hour)', classes: 8, hours: 1 },
  { name: '8 classes (1.5 hours)', classes: 8, hours: 1.5 },
  { name: '8 classes (2 hours)', classes: 8, hours: 2 },
  { name: '12 classes (1.5 hours)', classes: 12, hours: 1.5 },
  { name: '12 classes (2 hours)', classes: 12, hours: 2 },
  { name: '16 classes (1.5 hours)', classes: 16, hours: 1.5 },
  { name: '16 classes (2 hours)', classes: 16, hours: 2 }
];

const formatPackageOption = (option) => ({
  ...option.toObject(),
  label: option.name
});

const ensureDefaultPackageOptions = async () => {
  const count = await PackageOption.countDocuments();
  if (count > 0) return;
  await PackageOption.insertMany(defaultPackageOptions);
};

const getPackageOptions = async (req, res, next) => {
  try {
    await ensureDefaultPackageOptions();
    const options = await PackageOption.find().sort({ createdAt: 1, _id: 1 });
    res.json(options.map(formatPackageOption));
  } catch (error) {
    next(error);
  }
};

const createPackageOption = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, classes, hours, isActive } = body;
    if (!name) {
      return res.status(400).json({ message: 'Package name is required.' });
    }

    const option = await PackageOption.create({
      name,
      classes: parseLocalizedNumber(classes),
      hours: parseLocalizedNumber(hours),
      isActive: isActive !== false
    });
    await createAuditLog({ userId: req.user._id, action: 'create package option', entity: 'PackageOption', entityId: option._id, req });
    res.status(201).json(formatPackageOption(option));
  } catch (error) {
    next(error);
  }
};

const updatePackageOption = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid package ID.' });
    }

    const body = sanitizeObject(req.body);
    const option = await PackageOption.findById(id);
    if (!option) {
      return res.status(404).json({ message: 'Package not found.' });
    }

    if (body.name !== undefined) option.name = body.name;
    if (body.classes !== undefined) option.classes = parseLocalizedNumber(body.classes);
    if (body.hours !== undefined) option.hours = parseLocalizedNumber(body.hours);
    if (typeof body.isActive === 'boolean') option.isActive = body.isActive;

    await option.save();
    await createAuditLog({ userId: req.user._id, action: 'update package option', entity: 'PackageOption', entityId: option._id, req });
    res.json(formatPackageOption(option));
  } catch (error) {
    next(error);
  }
};

const deletePackageOption = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid package ID.' });
    }

    const option = await PackageOption.findById(id);
    if (!option) {
      return res.status(404).json({ message: 'Package not found.' });
    }

    await option.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete package option', entity: 'PackageOption', entityId: option._id, req });
    res.json({ message: 'Package deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPackageOptions, createPackageOption, updatePackageOption, deletePackageOption };
