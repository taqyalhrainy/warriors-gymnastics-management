import test from 'node:test';
import assert from 'node:assert/strict';
import { getInstallPlatform, withInstallTimeout, isParentApkInstalled } from '../src/utils/installPlatform.js';

test('installed warning requires the exact Android app, never just a PWA or a download', async () => {
  assert.equal(await isParentApkInstalled({}), false);
  assert.equal(await isParentApkInstalled({ getInstalledRelatedApps: async () => [{ platform: 'webapp', id: '/parent-pwa-v3' }] }), false);
  assert.equal(await isParentApkInstalled({ getInstalledRelatedApps: async () => [{ platform: 'play', id: 'other.app' }] }), false);
  assert.equal(await isParentApkInstalled({ getInstalledRelatedApps: async () => [{ platform: 'play', id: 'com.warriorsgymnastics.app' }] }), true);
  assert.equal(await isParentApkInstalled({ getInstalledRelatedApps: async () => { throw new Error('unsupported'); } }), false);
});

test('Android detection handles normal, desktop-mode and client-hint user agents', () => {
  for (const navigator of [
    { userAgent: 'Mozilla Android Chrome' },
    { userAgent: 'Mozilla X11 Linux x86_64 Chrome', platform: 'Linux armv8l', maxTouchPoints: 5 },
    { userAgent: 'Mozilla X11 Linux x86_64 Chrome', userAgentData: { platform: 'Android' } }
  ]) {
    assert.equal(getInstallPlatform(navigator).isAndroid, true);
    assert.equal(getInstallPlatform(navigator).isMobile, true);
  }
});

test('iPad desktop mode stays iOS; unidentified touch devices do not get QR', () => {
  const ipad = getInstallPlatform({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Safari' });
  assert.equal(ipad.isIOS, true);
  assert.equal(ipad.isAndroid, false);
  assert.equal(getInstallPlatform({ platform: 'Unknown', maxTouchPoints: 2 }).isMobile, true);
  assert.equal(getInstallPlatform({ platform: 'Win32', maxTouchPoints: 0 }).isMobile, false);
});

test('stalled preparation times out while ready and failed prompts settle normally', async () => {
  await assert.rejects(withInstallTimeout(new Promise(() => {}), 10), /timed out/);
  assert.equal(await withInstallTimeout(Promise.resolve('ready')), 'ready');
  await assert.rejects(withInstallTimeout(Promise.reject(new Error('used prompt'))), /used prompt/);
});
