const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RecoveryAttempt = require('../models/RecoveryAttempt');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const generateCode = () => crypto.randomBytes(20).toString('hex').toUpperCase().match(/.{4}/g).join('-');
const normalizeCode = (value) => typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : '';
const invalid = (res) => res.status(400).json({ message: 'Unable to verify these details. Check your credentials and try again.' });
const validPassword = ({ newPassword, confirmPassword }) => typeof newPassword === 'string'
  && newPassword.length >= 12 && Buffer.byteLength(newPassword, 'utf8') <= 72 && newPassword === confirmPassword;

// Persistent, atomic limits apply equally to real and nonexistent accounts.
const recoveryLimit = async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const identity = req.user ? String(req.user._id) : String(req.body.username || '').trim().toLowerCase().slice(0, 254);
    const windowMs = 15 * 60 * 1000;
    const bucket = Math.floor(Date.now() / windowMs);
    for (const [key, max] of [[`account:${identity}`, 5], [`ip:${req.ip}`, 30]]) {
      const _id = hash(`${key}:${bucket}`);
      let attempt;
      try {
        attempt = await RecoveryAttempt.findOneAndUpdate({ _id }, {
          $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) }
        }, { upsert: true, new: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
        attempt = await RecoveryAttempt.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { new: true });
      }
      if (attempt.count > max) {
        res.set('Retry-After', String(Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)));
        return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' });
      }
    }
    next();
  } catch (error) { next(error); }
};

const changePassword = async (req, res, next) => {
  try {
    if (!validPassword(req.body)) return res.status(400).json({ message: 'Passwords must match and contain at least 12 characters, up to 72 UTF-8 bytes.' });
    const user = await User.findOne({ _id: req.user._id, role: 'admin', isActive: true });
    if (!user || typeof req.body.currentPassword !== 'string' || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return invalid(res);
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    const result = await User.updateOne({ _id: user._id, role: 'admin', passwordHash: user.passwordHash }, {
      $set: { passwordHash }, $inc: { sessionVersion: 1 }
    });
    if (!result.modifiedCount) return invalid(res);
    res.json({ message: 'Password changed. Sign in with your new password.' });
  } catch (error) { next(error); }
};

const regenerateCode = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.user._id, role: 'admin', isActive: true });
    if (!user || typeof req.body.currentPassword !== 'string' || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) return invalid(res);
    const recoveryCode = generateCode();
    const result = await User.updateOne({ _id: user._id, role: 'admin', passwordHash: user.passwordHash }, {
      $set: { recoveryCodeHash: hash(normalizeCode(recoveryCode)) }
    });
    if (!result.modifiedCount) return invalid(res);
    res.json({ recoveryCode });
  } catch (error) { next(error); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { username, recoveryCode } = req.body;
    if (!validPassword(req.body)) return res.status(400).json({ message: 'Passwords must match and contain at least 12 characters, up to 72 UTF-8 bytes.' });
    if (typeof username !== 'string' || username.length > 254 || typeof recoveryCode !== 'string' || recoveryCode.length > 100) return invalid(res);
    const usedHash = hash(normalizeCode(recoveryCode));
    const nextCode = generateCode();
    // Hash for every attempt; one atomic write both consumes the code and changes the password.
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    const result = await User.updateOne({ email: username.trim().toLowerCase(), role: 'admin', isActive: true, recoveryCodeHash: usedHash }, {
      $set: { passwordHash, recoveryCodeHash: hash(normalizeCode(nextCode)) }, $inc: { sessionVersion: 1 }
    });
    if (!result.modifiedCount) return invalid(res);
    res.json({ recoveryCode: nextCode, message: 'Password reset. Save your new recovery code, then sign in.' });
  } catch (error) { next(error); }
};

module.exports = { recoveryLimit, changePassword, regenerateCode, resetPassword, generateCode, normalizeCode, hash };
