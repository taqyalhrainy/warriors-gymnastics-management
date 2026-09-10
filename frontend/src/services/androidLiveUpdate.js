import { Capacitor } from '@capacitor/core';
import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { NativePushSession } from '../utils/nativePushNotifications.js';

let readyPromise;
let checking;
let lastCheck = 0;
const decodeBase64 = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export const verifyOtaManifest = async (envelope, config) => {
  if (typeof envelope?.payload !== 'string' || envelope.payload.length > 10000
    || typeof envelope.signature !== 'string') throw new Error('Invalid OTA manifest.');
  const keyBytes = decodeBase64(config.publicKey.replace(/-----[^-]+-----|\s/g, ''));
  const key = await crypto.subtle.importKey('spki', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64(envelope.signature),
    new TextEncoder().encode(envelope.payload))) throw new Error('OTA manifest signature rejected.');
  const manifest = JSON.parse(envelope.payload);
  if (manifest.contract !== config.contract || !/^[a-f0-9]{64}$/.test(manifest.bundleId)
    || manifest.bundleId !== manifest.checksum || typeof manifest.signature !== 'string') {
    throw new Error('OTA native compatibility check failed.');
  }
  return manifest;
};

const checkForUpdate = () => {
  if (checking || Date.now() - lastCheck < 15 * 60 * 1000) return checking;
  lastCheck = Date.now();
  checking = (async () => {
    const config = await NativePushSession.getOtaConfig();
    if (!/^android-[a-f0-9]{24}$/.test(config.contract) || !config.publicKey) return;
    const origin = new URL(config.origin);
    if (origin.protocol !== 'https:') return;
    const base = origin.origin + '/ota/' + config.contract + '/';
    const response = await fetch(base + 'latest.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return;
    if (!response.ok) throw new Error('OTA service unavailable.');
    const manifest = await verifyOtaManifest(await response.json(), config);
    const current = await LiveUpdate.getCurrentBundle();
    const next = await LiveUpdate.getNextBundle();
    const blocked = await LiveUpdate.getBlockedBundles();
    if (current.bundleId === manifest.bundleId || next.bundleId === manifest.bundleId
      || blocked.bundleIds.includes(manifest.bundleId)) return;
    const downloaded = await LiveUpdate.getDownloadedBundles();
    if (!downloaded.bundleIds.includes(manifest.bundleId)) {
      await LiveUpdate.downloadBundle({ bundleId: manifest.bundleId, checksum: manifest.checksum,
        signature: manifest.signature, url: base + manifest.bundleId + '.zip', artifactType: 'zip' });
    }
    // Never reload while the parent is filling in a form. Activate on the next cold start.
    await LiveUpdate.setNextBundle({ bundleId: manifest.bundleId });
  })().catch((error) => console.warn('Android update deferred:', error.message))
    .finally(() => { checking = undefined; });
  return checking;
};

export const markAndroidAppReady = () => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return Promise.resolve();
  if (!readyPromise) {
    readyPromise = LiveUpdate.ready().then(() => {
      window.addEventListener('online', checkForUpdate);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkForUpdate();
      });
      return checkForUpdate();
    }).catch((error) => console.error('Android update readiness failed:', error.message));
  }
  return readyPromise;
};
