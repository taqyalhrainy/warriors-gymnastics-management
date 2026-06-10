const mongoose = require('mongoose');
const validator = require('validator');

const sanitizeText = (value) => {
  if (typeof value !== 'string') return value;
  return validator.escape(value.trim());
};

const validateObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const validateEmail = (email) => validator.isEmail(email || '');

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const sanitized = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => (typeof item === 'string' ? sanitizeText(item) : item));
    } else {
      sanitized[key] = value;
    }
  });
  return sanitized;
};

module.exports = { sanitizeText, validateObjectId, validateEmail, sanitizeObject };
