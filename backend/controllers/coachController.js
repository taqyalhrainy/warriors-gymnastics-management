const bcrypt = require('bcryptjs');
const Coach = require('../models/Coach');
const User = require('../models/User');
const { sanitizeObject, validateEmail, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const getCoaches = async (req, res, next) => {
  try {
    const coaches = await Coach.find().sort({ _id: -1 }).populate('userId', 'name email role isActive');
    res.json(coaches);
  } catch (error) {
    next(error);
  }
};

const createCoach = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, email, phone, specialization } = body;
    if (!name) {
      return res.status(400).json({ message: 'Coach name is required.' });
    }
    let userId = null;
    if (email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
      }
      let user = await User.findOne({ email });
      if (user && user.role !== 'coach') {
        return res.status(400).json({ message: 'Email is already used by another account.' });
      }
      if (!user) {
        const passwordHash = await bcrypt.hash('Coach@12345', 12);
        user = await User.create({ name, email, passwordHash, role: 'coach', phone: phone || '', isActive: true });
      } else {
        user.name = name;
        user.phone = phone || user.phone;
        user.isActive = true;
        await user.save();
      }
      userId = user._id;
    }

    const coach = await Coach.create({ userId, name, phone: phone || '', specialization: specialization || '' });
    await createAuditLog({ userId: req.user._id, action: 'create coach', entity: 'Coach', entityId: coach._id, req });
    res.status(201).json(coach);
  } catch (error) {
    next(error);
  }
};

const updateCoach = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid coach ID.' });
    }
    const body = sanitizeObject(req.body);
    const { name, email, phone, specialization } = body;
    const coach = await Coach.findById(id);
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }
    if (name) coach.name = name;
    if (typeof phone !== 'undefined') coach.phone = phone;
    if (typeof specialization !== 'undefined') coach.specialization = specialization;
    if (email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
      }
      let user = null;
      if (coach.userId) {
        user = await User.findById(coach.userId);
      }
      if (!user) {
        const existingUser = await User.findOne({ email });
        if (existingUser && String(existingUser._id) !== String(coach.userId)) {
          return res.status(400).json({ message: 'Email already used by another account.' });
        }
      }
      if (!user) {
        const passwordHash = await bcrypt.hash('Coach@12345', 12);
        user = await User.create({ name: coach.name, email, passwordHash, role: 'coach', phone: phone || '', isActive: true });
        coach.userId = user._id;
      } else {
        user.email = email;
        user.name = name || user.name;
        user.phone = phone || user.phone;
        await user.save();
      }
    }
    await coach.save();
    await createAuditLog({ userId: req.user._id, action: 'update coach', entity: 'Coach', entityId: coach._id, req });
    res.json(coach);
  } catch (error) {
    next(error);
  }
};

const deleteCoach = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid coach ID.' });
    }
    const coach = await Coach.findById(id);
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }
    await coach.deleteOne();
    await createAuditLog({ userId: req.user._id, action: 'delete coach', entity: 'Coach', entityId: coach._id, req });
    res.json({ message: 'Coach deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCoaches, createCoach, updateCoach, deleteCoach };
