const mongoose = require('mongoose');
const validator = require('validator');

const sanitizeText = (value) => {
  if (typeof value !== 'string') return value;
  return validator.unescape(value.trim());
};

const decodeText = (value) => {
  if (typeof value !== 'string') return value;
  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    const nextDecoded = validator.unescape(decoded);
    if (nextDecoded === decoded) break;
    decoded = nextDecoded;
  }
  return decoded;
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

module.exports = { sanitizeText, decodeText, validateObjectId, validateEmail, sanitizeObject };
