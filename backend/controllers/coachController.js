const bcrypt = require('bcryptjs');
const Coach = require('../models/Coach');
const CoachAttendance = require('../models/CoachAttendance');
const User = require('../models/User');
const { sanitizeObject, validateEmail, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const getDateOnly = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatCoachResponse = (coach, attendanceByCoachId = new Map()) => {
  const obj = coach.toObject ? coach.toObject() : coach;
  obj.todayAttendance = attendanceByCoachId.get(String(obj._id)) || null;
  return obj;
};

const attachTodayAttendance = async (coaches, dateValue) => {
  const rows = Array.isArray(coaches) ? coaches : [coaches].filter(Boolean);
  const date = getDateOnly(dateValue);
  const attendanceRows = rows.length
    ? await CoachAttendance.find({ coachId: { $in: rows.map((coach) => coach._id) }, date }).lean()
    : [];
  const attendanceByCoachId = new Map(attendanceRows.map((row) => [String(row.coachId), row]));
  const formattedRows = rows.map((coach) => formatCoachResponse(coach, attendanceByCoachId));
  return Array.isArray(coaches) ? formattedRows : formattedRows[0];
};

const getCoaches = async (req, res, next) => {
  try {
    const coaches = await Coach.find().sort({ _id: -1 }).populate('userId', 'name email role isActive');
    res.json(await attachTodayAttendance(coaches, req.query.date));
  } catch (error) {
    next(error);
  }
};

const getCoachById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid coach ID.' });
    }

    const coach = await Coach.findById(id).populate('userId', 'name email role isActive');
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }

    const attendanceHistory = await CoachAttendance.find({ coachId: coach._id })
      .sort({ date: -1, updatedAt: -1, _id: -1 })
      .lean();

    res.json({ ...coach.toObject(), attendanceHistory });
  } catch (error) {
    next(error);
  }
};

const createCoach = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, email, phone, phone2, specialization } = body;
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

    const coach = await Coach.create({ userId, name, phone: phone || '', phone2: phone2 || '', specialization: specialization || '' });
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
    const { name, email, phone, phone2, specialization } = body;
    const coach = await Coach.findById(id);
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }
    if (name) coach.name = name;
    if (typeof phone !== 'undefined') coach.phone = phone;
    if (typeof phone2 !== 'undefined') coach.phone2 = phone2;
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

const updateCoachAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid coach ID.' });
    }

    const body = sanitizeObject(req.body);
    const action = String(body.action || '').trim().toLowerCase();
    if (!['arrived', 'left', 'absent'].includes(action)) {
      return res.status(400).json({ message: 'Invalid coach attendance action.' });
    }

    const coach = await Coach.findById(id);
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found.' });
    }

    const now = new Date();
    const date = getDateOnly(body.date || now);
    const setFields = {
      coachId: coach._id,
      date,
      updatedBy: req.user._id,
      updatedAt: now
    };
    const unsetFields = {};

    if (action === 'arrived') {
      setFields.status = 'present';
      setFields.arrivedAt = now;
      unsetFields.leftAt = '';
      unsetFields.absentAt = '';
    } else if (action === 'left') {
      setFields.status = 'left';
      setFields.leftAt = now;
      unsetFields.absentAt = '';
    } else {
      setFields.status = 'absent';
      setFields.absentAt = now;
      unsetFields.arrivedAt = '';
      unsetFields.leftAt = '';
    }

    const attendance = await CoachAttendance.findOneAndUpdate(
      { coachId: coach._id, date },
      {
        $set: setFields,
        $unset: unsetFields,
        $setOnInsert: { createdBy: req.user._id, createdAt: now }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    await createAuditLog({ userId: req.user._id, action: `coach ${action}`, entity: 'CoachAttendance', entityId: attendance._id, req });
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

module.exports = { getCoaches, getCoachById, createCoach, updateCoach, deleteCoach, updateCoachAttendance };
