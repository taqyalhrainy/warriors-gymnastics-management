const NotificationAttachment = require('../models/NotificationAttachment');

const MAX_ATTACHMENT_BYTES = 1250 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

const invalidAttachment = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const hasExpectedSignature = (mimeType, bytes) => {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
};

const normalizeImageAttachment = (attachment) => {
  if (!attachment) return null;
  if (typeof attachment !== 'object' || typeof attachment.dataUrl !== 'string') {
    throw invalidAttachment('The notification attachment is invalid.');
  }

  const match = DATA_URL_PATTERN.exec(attachment.dataUrl.trim());
  if (!match) {
    throw invalidAttachment('Only JPEG, PNG, or WebP image attachments are allowed.');
  }

  const [, mimeType, encoded] = match;
  if (encoded.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 4) {
    throw invalidAttachment('The image attachment is too large. Choose an image smaller than 1.25 MB.');
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES) {
    throw invalidAttachment('The image attachment is too large. Choose an image smaller than 1.25 MB.');
  }
  if (!hasExpectedSignature(mimeType, bytes)) {
    throw invalidAttachment('The attachment content does not match its image type.');
  }

  const fileName = String(attachment.fileName || 'notification-image')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 120);
  return {
    kind: 'image',
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    mimeType,
    fileName,
    byteLength: bytes.length
  };
};

const createNotificationAttachment = async (attachment, createdBy) => {
  const normalized = normalizeImageAttachment(attachment);
  if (!normalized) return null;
  return NotificationAttachment.create({ ...normalized, createdBy });
};

const deleteNotificationAttachment = (attachmentId) => (
  attachmentId ? NotificationAttachment.deleteOne({ _id: attachmentId }) : Promise.resolve()
);

module.exports = {
  MAX_ATTACHMENT_BYTES,
  normalizeImageAttachment,
  createNotificationAttachment,
  deleteNotificationAttachment
};
