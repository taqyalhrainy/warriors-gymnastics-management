import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { verifySignedOtaBundle } from './ota-package-core.mjs';
import { assertParentBundleFiles } from './parent-build-guard.mjs';

if (process.env.OTA_APPLY_STAGED !== 'YES_I_UNDERSTAND') {
  throw new Error('Refusing to apply OTA files without OTA_APPLY_STAGED=YES_I_UNDERSTAND.');
}
if (!process.env.OTA_STAGING_ROOT) throw new Error('OTA_STAGING_ROOT is required.');

const root = fileURLToPath(new URL('../', import.meta.url));
const stagingRoot = path.resolve(process.env.OTA_STAGING_ROOT);
const outputRoot = path.resolve(process.env.OTA_OUTPUT_ROOT || path.join(root, '../backend/public/ota'));
const localTest = process.env.OTA_LOCAL_TEST_ONLY === 'YES';
if (process.env.OTA_PUBLIC_KEY_PATH && !localTest) {
  throw new Error('A custom OTA public key is allowed only in explicit local test mode.');
}
const publicKey = readFileSync(localTest && process.env.OTA_PUBLIC_KEY_PATH
  ? path.resolve(process.env.OTA_PUBLIC_KEY_PATH) : new URL('../ota-public-key.pem', import.meta.url));
const channels = JSON.parse(readFileSync(new URL('../ota-channels.json', import.meta.url), 'utf8'));
const allowed = new Map([
  [channels.legacyAndroid.contract, 'legacy'],
  [channels.googlePlayParents.contract, 'parents']
]);
const planPath = path.join(stagingRoot, 'publication-plan.json');
if (!existsSync(planPath)) throw new Error('No staged OTA publication plan was found.');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
if (plan.version !== 1 || !Array.isArray(plan.channels) || !plan.channels.length) {
  throw new Error('Invalid staged OTA publication plan.');
}

const verified = plan.channels.map((item) => {
  if (allowed.get(item.contract) !== item.name) throw new Error('Unknown or mismatched OTA channel in plan.');
  const result = verifySignedOtaBundle({ outputRoot: stagingRoot, contract: item.contract, publicKey });
  if (result.manifest.bundleId !== item.bundleId) throw new Error('Staged OTA plan does not match its bundle.');
  if (item.name === 'parents') assertParentBundleFiles(unzipSync(new Uint8Array(result.zip)));
  return { ...item, ...result };
});

for (const item of verified) {
  const target = path.join(outputRoot, item.contract);
  mkdirSync(target, { recursive: true });
  copyFileSync(path.join(item.output, `${item.bundleId}.zip`), path.join(target, `${item.bundleId}.zip`));
  const nextManifest = path.join(target, `latest.${process.pid}.next.json`);
  copyFileSync(path.join(item.output, 'latest.json'), nextManifest);
  renameSync(nextManifest, path.join(target, 'latest.json'));
}
console.log(`Applied staged OTA files for ${verified.map(({ name }) => name).join(', ')}.`);
