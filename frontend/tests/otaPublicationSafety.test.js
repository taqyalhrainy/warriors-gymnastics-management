import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSignedOtaBundle, verifySignedOtaBundle } from '../scripts/ota-package-core.mjs';
import { assertParentBundleFiles } from '../scripts/parent-build-guard.mjs';
import { unzipSync } from 'fflate';

test('staged OTA bundles verify before publication and parent guard inspects the archive', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'warriors-ota-test-'));
  const dist = path.join(temp, 'dist');
  const outputRoot = path.join(temp, 'staging');
  mkdirSync(dist);
  writeFileSync(path.join(dist, 'index.html'), '<div id="root"></div>');
  writeFileSync(path.join(dist, 'parent.js'), 'const route = "/parent";');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  try {
    const contract = 'android-1234567890abcdef12345678';
    createSignedOtaBundle({ distDir: dist, outputRoot, contract, privateKey, publicKey });
    const verified = verifySignedOtaBundle({ outputRoot, contract, publicKey });
    assertParentBundleFiles(unzipSync(new Uint8Array(verified.zip)));
    const envelopePath = path.join(outputRoot, contract, 'latest.json');
    const envelope = JSON.parse(readFileSync(envelopePath, 'utf8'));
    envelope.signature = Buffer.from('tampered').toString('base64');
    writeFileSync(envelopePath, JSON.stringify(envelope));
    assert.throws(() => verifySignedOtaBundle({ outputRoot, contract, publicKey }), /verification failed/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('parent archive guard rejects admin runtime code', () => {
  assert.throws(() => assertParentBundleFiles({
    'index.html': Buffer.from('<script src="app.js"></script>'),
    'app.js': Buffer.from('const page = "AdminDashboard";')
  }), /admin runtime code/i);
});
