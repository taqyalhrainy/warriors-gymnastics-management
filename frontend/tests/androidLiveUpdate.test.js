import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, webcrypto } from 'node:crypto';
import { load } from './moduleHarness.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { format: 'pem', type: 'spki' }, privateKeyEncoding: { format: 'pem', type: 'pkcs8' } });
const contract = 'android-' + 'a'.repeat(24);
const bundleId = 'b'.repeat(64);
const manifest = (changes = {}) => {
  const payload = JSON.stringify({ contract, bundleId, checksum: bundleId, signature: 'zip-signature', ...changes });
  return { payload, signature: sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64') };
};
const setup = async (options = {}) => {
  const calls = [];
  const service = await load('../src/services/androidLiveUpdate.js', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => options.native !== false, getPlatform: () => 'android' } },
    '@capawesome/capacitor-live-update': { LiveUpdate: {
      ready: async () => calls.push('ready'), getCurrentBundle: async () => ({ bundleId: null }),
      getNextBundle: async () => ({ bundleId: null }), getBlockedBundles: async () => ({ bundleIds: options.blocked ? [bundleId] : [] }),
      getDownloadedBundles: async () => ({ bundleIds: [] }),
      downloadBundle: async (bundle) => { calls.push(bundle); if (options.failure) throw new Error('Download failed'); },
      setNextBundle: async () => calls.push('staged')
    } },
    '../utils/nativePushNotifications.js': { NativePushSession: { getOtaConfig: async () => ({ contract, publicKey, origin: 'https://updates.test' }) } }
  }, { crypto: webcrypto, atob, TextEncoder, Uint8Array, URL, AbortSignal, console,
    window: { addEventListener() {} }, document: { addEventListener() {} },
    fetch: async () => { calls.push('fetch'); return { ok: true, json: async () => options.envelope || manifest() }; } });
  return { service, calls };
};

test('valid signed OTA is staged only after readiness, without interrupting the app', async () => {
  const { service, calls } = await setup();
  await service.markAndroidAppReady();
  assert.equal(calls[0], 'ready');
  assert.equal(calls.at(-1), 'staged');
  assert.equal(calls[2].checksum, bundleId);
  assert.match(calls[2].url, /^https:\/\/updates.test\/ota\/android-/);
  await service.markAndroidAppReady();
  assert.equal(calls.filter((call) => call === 'ready').length, 1);
});

test('tampered manifests and signed bundles for a different native build are rejected', async () => {
  const { service } = await setup();
  const envelope = manifest();
  envelope.payload = envelope.payload.replace('zip-signature', 'tampered');
  await assert.rejects(service.verifyOtaManifest(envelope, { publicKey, contract }), /signature/);
  await assert.rejects(service.verifyOtaManifest(manifest({ contract: 'android-other' }), { publicKey, contract }), /compatibility/);
});

test('rolled-back bundles are never downloaded or staged again', async () => {
  const { service, calls } = await setup({ blocked: true });
  await service.markAndroidAppReady();
  assert.deepEqual(calls, ['ready', 'fetch']);
});

test('failed downloads preserve the active bundle', async () => {
  const { service, calls } = await setup({ failure: true });
  await service.markAndroidAppReady();
  assert.ok(!calls.includes('staged'));
});

test('iPhone and website never initialize OTA or contact the update service', async () => {
  const { service, calls } = await setup({ native: false });
  await service.markAndroidAppReady();
  assert.deepEqual(calls, []);
});
