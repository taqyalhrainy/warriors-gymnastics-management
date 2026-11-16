const crypto = require('node:crypto');
const { normalizeImageAttachment } = require('./notificationAttachments');

const MAX_CHAT_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const fail = (message) => { const error = new Error(message); error.statusCode = 400; throw error; };
const normalizeChatAttachment = (attachment) => {
  if (!attachment) return undefined;
  if (typeof attachment.dataUrl !== 'string' || attachment.dataUrl.length > Math.ceil(MAX_CHAT_ATTACHMENT_BYTES * 4 / 3) + 100) {
    return fail('Choose a photo, video or audio file smaller than 3 MB.');
  }
  const match = /^data:((?:image|audio|video)\/[a-z0-9.+-]+)(?:;codecs=[a-z0-9.,-]+)?;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(attachment.dataUrl);
  if (!match) return fail('Unsupported chat attachment.');
  const mimeType = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_CHAT_ATTACHMENT_BYTES) return fail('The attachment must be smaller than 3 MB.');
  if (mimeType.startsWith('image/')) {
    normalizeImageAttachment({ ...attachment, dataUrl: `data:${mimeType};base64,${match[2]}` });
  } else {
    const starts = (value) => bytes.subarray(0, value.length).equals(Buffer.from(value));
    const signatures = {
      'audio/webm': () => starts([0x1a, 0x45, 0xdf, 0xa3]),
      'video/webm': () => starts([0x1a, 0x45, 0xdf, 0xa3]),
      'audio/ogg': () => starts('OggS'),
      'audio/mpeg': () => starts('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      'audio/aac': () => bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0,
      'audio/wav': () => starts('RIFF') && bytes.subarray(8, 12).toString() === 'WAVE',
      'audio/x-wav': () => starts('RIFF') && bytes.subarray(8, 12).toString() === 'WAVE',
      'audio/mp4': () => bytes.subarray(4, 8).toString() === 'ftyp',
      'video/mp4': () => bytes.subarray(4, 8).toString() === 'ftyp',
      'video/quicktime': () => bytes.subarray(4, 8).toString() === 'ftyp'
    };
    if (!signatures[mimeType]?.()) return fail('The file content does not match a supported photo, video or audio format.');
  }
  return {
    kind: mimeType.split('/')[0], mimeType,
    fileName: String(attachment.fileName || 'chat-media').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120),
    byteLength: bytes.length, data: bytes,
    checksum: crypto.createHash('sha256').update(bytes).digest('hex')
  };
};

const publicChatMessage = (message) => {
  const result = message.toObject ? message.toObject() : { ...message };
  if (result.attachment) {
    const { data, checksum, ...metadata } = result.attachment;
    result.attachment = metadata;
  }
  return { ...result, key: `message-${result._id}`, kind: 'message' };
};
module.exports = { MAX_CHAT_ATTACHMENT_BYTES, normalizeChatAttachment, publicChatMessage };
