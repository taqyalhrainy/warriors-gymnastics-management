const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_ATTACHMENT_BYTES,
  normalizeImageAttachment
} = require('../utils/notificationAttachments');

const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=';

test('notification image attachment is normalized and keeps safe metadata', () => {
  const result = normalizeImageAttachment({
    dataUrl: `data:image/png;base64,${onePixelPng}`,
    fileName: '../training:photo.png'
  });
  assert.equal(result.kind, 'image');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.fileName, '.._training_photo.png');
  assert.ok(result.byteLength > 0);
  assert.ok(result.dataUrl.startsWith('data:image/png;base64,'));
});

test('notification attachment rejects executable formats and false image signatures', () => {
  assert.throws(
    () => normalizeImageAttachment({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }),
    /JPEG, PNG, or WebP/
  );
  assert.throws(
    () => normalizeImageAttachment({ dataUrl: `data:image/jpeg;base64,${Buffer.from('not-an-image').toString('base64')}` }),
    /does not match/
  );
});

test('notification attachment enforces the stored byte limit', () => {
  const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  assert.throws(
    () => normalizeImageAttachment({ dataUrl: `data:image/jpeg;base64,${oversized.toString('base64')}` }),
    /too large/
  );
});
