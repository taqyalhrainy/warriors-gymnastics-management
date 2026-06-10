const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Parent = require('../models/Parent');
const { sanitizeObject, validateEmail } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt } = require('../utils/encryption');

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const registerUser = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, email, password, role, phone } = body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required.' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    let phoneEncrypted = '';
    if (role === 'parent') {
      try {
        phoneEncrypted = encrypt(phone || '');
      } catch (encryptError) {
        return res.status(500).json({ message: encryptError.message });
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
    next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = sanitizeObject(req.body);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    await createAuditLog({ userId: user._id, action: 'login', entity: 'User', entityId: user._id, req });
    return res.json({ token: signToken(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  const user = req.user;
  res.json({ user });
};

module.exports = { registerUser, loginUser, getMe };
