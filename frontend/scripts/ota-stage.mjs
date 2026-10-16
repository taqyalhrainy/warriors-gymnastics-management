import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { nativeContract } from './native-contract.mjs';
import { createSignedOtaBundle, verifySignedOtaBundle } from './ota-package-core.mjs';
import { assertParentBundleFiles, assertParentDist } from './parent-build-guard.mjs';
import { publicKeyFingerprint } from './public-key-fingerprint.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const channels = JSON.parse(readFileSync(new URL('../ota-channels.json', import.meta.url), 'utf8'));
const selection = process.env.OTA_CHANNELS;
if (!['legacy', 'parents', 'both'].includes(selection)) {
  throw new Error('Set OTA_CHANNELS to legacy, parents, or both.');
}

const outputRoot = path.resolve(process.env.OTA_STAGING_ROOT || path.join(root, '.ota-staging'));
const privateKeyPath = new URL('../.ota-secrets/signing-private.pem', import.meta.url);
const privateKey = process.env.OTA_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n')
  || (existsSync(privateKeyPath) ? readFileSync(privateKeyPath, 'utf8') : '');
if (!privateKey) throw new Error('OTA signing key is required to stage a publication.');
const localTest = process.env.OTA_LOCAL_TEST_ONLY === 'YES';
if (process.env.OTA_PUBLIC_KEY_PATH && !localTest) {
  throw new Error('A custom OTA public key is allowed only in explicit local test mode.');
}
const publicKey = readFileSync(localTest && process.env.OTA_PUBLIC_KEY_PATH
  ? path.resolve(process.env.OTA_PUBLIC_KEY_PATH) : new URL('../ota-public-key.pem', import.meta.url));
const publicKeyHash = publicKeyFingerprint(publicKey);
const legacyContract = nativeContract();

if (channels.legacyAndroid.contract !== legacyContract
  || (!localTest && channels.legacyAndroid.publicKeySha256 !== publicKeyHash)) {
  throw new Error('Legacy OTA contract or public key changed from the protected baseline.');
}
if (channels.googlePlayParents.contract === legacyContract
  || (!localTest && channels.googlePlayParents.publicKeySha256 !== publicKeyHash)) {
  throw new Error('Google Play parent OTA channel is not safely isolated.');
}

mkdirSync(outputRoot, { recursive: true });
const staged = [];
const stage = (name, distDir, contract, parentOnly = false) => {
  if (parentOnly) assertParentDist(distDir);
  const result = createSignedOtaBundle({ distDir, outputRoot, contract, privateKey, publicKey });
  const verified = verifySignedOtaBundle({ outputRoot, contract, publicKey });
  if (parentOnly) assertParentBundleFiles(unzipSync(new Uint8Array(verified.zip)));
  staged.push({ name, contract, bundleId: result.bundleId });
};

if (selection === 'legacy' || selection === 'both') {
  stage('legacy', path.join(root, 'dist'), legacyContract);
}
if (selection === 'parents' || selection === 'both') {
  stage('parents', path.join(root, 'dist-parents'), channels.googlePlayParents.contract, true);
}

const plan = {
  version: 1,
  sourceRevision: process.env.GITHUB_SHA || 'local',
  channels: staged
};
writeFileSync(path.join(outputRoot, 'publication-plan.json'), JSON.stringify(plan, null, 2));
console.log(`Staged ${staged.map(({ name, contract }) => `${name}:${contract}`).join(', ')} in ${outputRoot}`);
