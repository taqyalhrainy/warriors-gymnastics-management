const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeChatAttachment, publicChatMessage, MAX_CHAT_ATTACHMENT_BYTES } = require('../utils/chatAttachments');
const media = (mime, bytes) => ({ dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, fileName: '../private.wav' });

test('chat attachments validate supported media signatures and do not trust filenames', () => {
  for (const [mime, bytes, kind] of [
    ['audio/webm;codecs=opus', [0x1a, 0x45, 0xdf, 0xa3, 0, 0], 'audio'],
    ['video/mp4', [0, 0, 0, 20, ...Buffer.from('ftypisom')], 'video'],
    ['image/png', [137, 80, 78, 71, 13, 10, 26, 10], 'image']
  ]) {
    const normalized = normalizeChatAttachment(media(mime, bytes));
    assert.equal(normalized.kind, kind);
    assert.equal(normalized.byteLength, bytes.length);
    assert.equal(normalized.checksum.length, 64);
    assert.equal(normalized.fileName.includes('/'), false);
  }
  assert.equal(normalizeChatAttachment(null), undefined);
});

test('chat attachments reject active formats, mismatched media and oversized content', () => {
  for (const input of [media('image/svg+xml', '<svg/>'), media('audio/webm', 'HTML'), media('video/mp4', '<html>'), media('application/pdf', '%PDF'), { dataUrl: 'not-a-data-url' }, { dataUrl: 'data:audio/webm;base64,' }]) {
    assert.throws(() => normalizeChatAttachment(input), { statusCode: 400 });
  }
  assert.throws(() => normalizeChatAttachment(media('audio/webm', Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + 1))), { statusCode: 400 });
});

test('message acknowledgements contain metadata without media bytes or checksum', () => {
  const message = publicChatMessage({ _id: 'id', text: '', attachment: normalizeChatAttachment(media('audio/ogg', 'OggS0000')) });
  assert.equal(message.attachment.kind, 'audio');
  assert.equal(message.attachment.data, undefined);
  assert.equal(message.attachment.checksum, undefined);
  assert.equal(message.key, 'message-id');
});
