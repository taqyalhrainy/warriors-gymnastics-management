import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nativeContract } from './native-contract.mjs';
import { assertParentDist } from './parent-build-guard.mjs';
import { createSignedOtaBundle } from './ota-package-core.mjs';
import { publicKeyFingerprint } from './public-key-fingerprint.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const channels = JSON.parse(readFileSync(new URL('../ota-channels.json', import.meta.url), 'utf8'));
const channel = channels.googlePlayParents;
const legacyContract = nativeContract();
if (channel.contract === legacyContract) throw new Error('Parent and legacy OTA contracts must be different.');

const publicKey = readFileSync(new URL('../ota-public-key.pem', import.meta.url));
const publicKeyHash = publicKeyFingerprint(publicKey);
if (publicKeyHash !== channel.publicKeySha256) {
  throw new Error('The parent APK OTA public key does not match this source tree.');
}

const privateKey = process.env.OTA_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n')
  || readFileSync(new URL('../.ota-secrets/signing-private.pem', import.meta.url), 'utf8');
const distDir = path.join(root, 'dist-parents');
assertParentDist(distDir);
const result = createSignedOtaBundle({
  distDir,
  outputRoot: path.resolve(root, '../backend/public/ota'),
  contract: channel.contract,
  privateKey,
  publicKey
});
console.log(`Signed parent-only Android OTA bundle: ${result.contract}/${result.bundleId}`);
