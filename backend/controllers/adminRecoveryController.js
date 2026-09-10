const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const RecoveryAttempt = require('../models/RecoveryAttempt');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const matchesSecret = (secret) => {
  const expected = process.env.ADMIN_RECOVERY_SECRET_HASH || '';
  if (!/^[a-f0-9]{64}$/i.test(expected) || typeof secret !== 'string' || secret.length > 256) return false;
  return crypto.timingSafeEqual(Buffer.from(hash(secret), 'hex'), Buffer.from(expected, 'hex'));
};
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
    req.recoveryAttemptIds = [];
    for (const [key, max] of [[`account:${identity}`, 5], [`ip:${req.ip}`, 30]]) {
      const _id = hash(`${key}:${bucket}`);
      req.recoveryAttemptIds.push(_id);
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

const clearSuccessfulAttempt = (req) => RecoveryAttempt.updateMany(
  { _id: { $in: req.recoveryAttemptIds || [] }, count: { $gt: 0 } }, { $inc: { count: -1 } }
);

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

const resetPassword = async (req, res, next) => {
  try {
    const { username, recoverySecret } = req.body;
    if (!validPassword(req.body)) return res.status(400).json({ message: 'Passwords must match and contain at least 12 characters, up to 72 UTF-8 bytes.' });
    if (typeof username !== 'string' || username.length > 254) return invalid(res);
    // Do the expensive work independently of account existence or secret validity.
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    if (!matchesSecret(recoverySecret)) return invalid(res);
    const result = await User.updateOne({ email: username.trim().toLowerCase(), role: 'admin', isActive: true }, {
      $set: { passwordHash }, $inc: { sessionVersion: 1 }
    });
    if (!result.modifiedCount) return invalid(res);
    await clearSuccessfulAttempt(req);
    res.json({ message: 'Password reset. Sign in with your new password.' });
  } catch (error) { next(error); }
};

module.exports = { recoveryLimit, changePassword, resetPassword, matchesSecret };
