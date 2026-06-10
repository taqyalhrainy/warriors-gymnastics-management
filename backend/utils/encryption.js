const crypto = require('crypto');

const IV_LENGTH = 16;
const getEncryptionKey = () => process.env.ENCRYPTION_KEY || '';

const validateKey = () => {
  const ENCRYPTION_KEY = getEncryptionKey();
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(ENCRYPTION_KEY)) {
    throw new Error('Invalid encryption key length. ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  }
};

const encrypt = (text) => {
  if (!text) return '';
  validateKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(getEncryptionKey(), 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
};

const decrypt = (cipherText) => {
  if (!cipherText) return '';
  validateKey();
  const [ivHex, encryptedData] = cipherText.split(':');
  if (!ivHex || !encryptedData) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(getEncryptionKey(), 'hex'), iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };
