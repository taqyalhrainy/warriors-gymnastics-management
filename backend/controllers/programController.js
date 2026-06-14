const Program = require('../models/Program');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { parseLocalizedNumber } = require('../utils/numberInput');

const getPrograms = async (req, res, next) => {
  try {
    const programs = await Program.find().sort({ _id: -1 });
    res.json(programs);
  } catch (error) {
    next(error);
  }
};

const createProgram = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, description, price, duration, level, isActive } = body;
    if (!name || price === undefined || price === '') {
      return res.status(400).json({ message: 'Program name and price are required.' });
    }
    const program = await Program.create({
      name,
      description,
      price: parseLocalizedNumber(price),
      duration,
      level,
      isActive: isActive !== false
    });
    await createAuditLog({ userId: req.user._id, action: 'create program', entity: 'Program', entityId: program._id, req });
    res.status(201).json(program);
  } catch (error) {
    next(error);
  }
};

const updateProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid program ID.' });
    }
    const body = sanitizeObject(req.body);
    const program = await Program.findById(id);
    if (!program) {
      return res.status(404).json({ message: 'Program not found.' });
    }
    ['name', 'description', 'duration', 'level'].forEach((field) => {
      if (body[field] !== undefined) program[field] = body[field];
    });
    if (body.price !== undefined) program.price = parseLocalizedNumber(body.price);
    if (typeof body.isActive === 'boolean') {
      program.isActive = body.isActive;
    }
    await program.save();
    await createAuditLog({ userId: req.user._id, action: 'update program', entity: 'Program', entityId: program._id, req });
    res.json(program);
  } catch (error) {
    next(error);
  }
};

const deleteProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid program ID.' });
    }
    const program = await Program.findById(id);
    if (!program) {
      return res.status(404).json({ message: 'Program not found.' });
    }
    await program.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete program', entity: 'Program', entityId: program._id, req });
    res.json({ message: 'Program deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPrograms, createProgram, updateProgram, deleteProgram };
