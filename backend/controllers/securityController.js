const bcrypt = require('bcryptjs');
const SecuritySetting = require('../models/SecuritySetting');
const { createAuditLog } = require('../utils/audit');

const PAYMENT_PASSWORD_KEY = 'payment-password-hash';
const DEFAULT_PAYMENT_PASSWORD = '1234';

const getPaymentPasswordSetting = async () => {
  let setting = await SecuritySetting.findOne({ key: PAYMENT_PASSWORD_KEY });

  if (!setting) {
    const value = await bcrypt.hash(DEFAULT_PAYMENT_PASSWORD, 12);
    setting = await SecuritySetting.create({ key: PAYMENT_PASSWORD_KEY, value });
  }

  return setting;
};

const verifyPaymentPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: 'Payment password is required.' });
    }

    const setting = await getPaymentPasswordSetting();
    const isValid = await bcrypt.compare(String(password), setting.value);

    if (!isValid) {
      return res.status(401).json({ message: 'Incorrect payment password.' });
    }

    await createAuditLog({ userId: req.user._id, action: 'unlock payment area', entity: 'SecuritySetting', entityId: setting._id, req });
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

const updatePaymentPassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'Old password, new password, and confirmation are required.' });
    }

    if (String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({ message: 'New password confirmation does not match.' });
    }

    if (String(newPassword).length < 4) {
      return res.status(400).json({ message: 'Payment password must be at least 4 characters.' });
    }

    const setting = await getPaymentPasswordSetting();
    const isOldPasswordValid = await bcrypt.compare(String(oldPassword), setting.value);

    if (!isOldPasswordValid) {
      return res.status(401).json({ message: 'Old payment password is incorrect.' });
    }

    setting.value = await bcrypt.hash(String(newPassword), 12);
    await setting.save();
    await createAuditLog({ userId: req.user._id, action: 'update payment password', entity: 'SecuritySetting', entityId: setting._id, req });

    return res.json({ message: 'Payment password updated successfully.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  verifyPaymentPassword,
  updatePaymentPassword
};
