const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Parent = require('../models/Parent');
const { sanitizeObject, validateEmail } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt } = require('../utils/encryption');

const signToken = (id, remember = false) => jwt.sign(
  { id },
  process.env.JWT_SECRET,
  { expiresIn: remember ? '90d' : '7d' }
);

const registerUser = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, password, role, phone } = body;
    const email = body.email?.toLowerCase().trim();
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required.' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    if (!['admin', 'coach', 'receptionist', 'parent'].includes(role)) {
      return res.status(400).json({ message: 'Invalid account role.' });
    }
    if (role === 'parent' && !phone?.trim()) {
      return res.status(400).json({ message: 'Phone is required for parent accounts.' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'This email is already registered. Please sign in instead.' });
    }
    let phoneEncrypted = '';
    if (role === 'parent') {
      try {
        phoneEncrypted = encrypt(phone || '');
      } catch (encryptError) {
        return res.status(500).json({
          message: 'Server encryption is not configured correctly. Please contact support.'
        });
      }
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role, phone: phone || '' });
    if (role === 'parent') {
      await Parent.create({
        userId: user._id,
        name: user.name,
        phoneEncrypted,
        email: user.email,
        children: []
      });
    }
    await createAuditLog({ userId: user._id, action: 'register', entity: 'User', entityId: user._id, req });
    return res.status(201).json({ token: signToken(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This email is already registered. Please sign in instead.' });
    }
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const email = body.email?.toLowerCase().trim();
    const name = body.name?.trim();
    const { password, remember } = body;
    if ((!email && !name) || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }
    const user = email
      ? await User.findOne({ email })
      : await User.findOne({ role: 'parent', name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!user) {
      return res.status(404).json({ message: 'No account found with these login details.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account is inactive. Please contact support.' });
    }
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    }
    await createAuditLog({ userId: user._id, action: 'login', entity: 'User', entityId: user._id, req });
    return res.json({ token: signToken(user._id, Boolean(remember)), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  const user = req.user;
  res.json({ user });
};

module.exports = { registerUser, loginUser, getMe };
