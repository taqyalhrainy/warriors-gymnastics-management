import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeContract } from '../scripts/native-contract.mjs';
import { assertParentModuleIds } from '../scripts/parent-build-guard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('legacy and Google Play parent OTA channels are isolated', () => {
  const channels = JSON.parse(readFileSync(resolve(root, 'ota-channels.json'), 'utf8'));
  const legacy = channels.legacyAndroid;
  const parents = channels.googlePlayParents;
  assert.equal(legacy.appId, 'com.warriorsgymnastics.app');
  assert.equal(legacy.contract, nativeContract());
  assert.equal(parents.appId, 'com.warriorsgymnastics.parents');
  assert.match(parents.contract, /^android-[a-f0-9]{24}$/);
  assert.notEqual(parents.contract, legacy.contract);
});

test('parent OTA contract uses the public key embedded in the current parent APK', () => {
  const channels = JSON.parse(readFileSync(resolve(root, 'ota-channels.json'), 'utf8'));
  const publicKey = readFileSync(resolve(root, 'ota-public-key.pem'));
  assert.equal(createHash('sha256').update(publicKey).digest('hex'),
    channels.googlePlayParents.publicKeySha256);
});

test('parent build guard rejects full app and admin modules', () => {
  assert.doesNotThrow(() => assertParentModuleIds([
    resolve(root, 'src/ParentApp.jsx'),
    resolve(root, 'src/pages/ParentDashboard.jsx'),
    resolve(root, 'src/components/ParentSidebar.jsx'),
    resolve(root, 'src/context/ParentAuthContext.jsx')
  ]));
  assert.throws(() => assertParentModuleIds([resolve(root, 'src/pages/AdminDashboard.jsx')]),
    /forbidden modules/i);
  assert.throws(() => assertParentModuleIds([resolve(root, 'src/App.jsx')]), /forbidden modules/i);
});

test('workflow verifies both builds and keeps publication disabled by default', () => {
  const workflow = readFileSync(resolve(root, '../.github/workflows/android-ota.yml'), 'utf8');
  assert.match(workflow, /group:\s*android-ota-main/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /publish_legacy:[\s\S]*?default:\s*false/);
  assert.match(workflow, /publish_google_play_parents:[\s\S]*?default:\s*false/);
  assert.match(workflow, /vars\.OTA_PUBLISH_MODE \|\| 'none'/);
  assert.match(workflow,
    /if:\s*github\.ref == 'refs\/heads\/main' && needs\.verify\.outputs\.publish_mode != 'none'/);
  assert.match(workflow, /npm run build\s/);
  assert.match(workflow, /npm run build:parents/);
  assert.match(workflow, /npm run ota:stage/);
  assert.match(workflow, /npm run ota:apply-staged/);
  assert.doesNotMatch(workflow, /ota:publish:all/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /git add backend\/public\/ota/);
});

test('protected OTA public key baseline is identical for both native apps', () => {
  const channels = JSON.parse(readFileSync(resolve(root, 'ota-channels.json'), 'utf8'));
  const publicKey = readFileSync(resolve(root, 'ota-public-key.pem'));
  const hash = createHash('sha256').update(publicKey).digest('hex');
  assert.equal(channels.legacyAndroid.publicKeySha256, hash);
  assert.equal(channels.googlePlayParents.publicKeySha256, hash);
});
