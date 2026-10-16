import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeContract } from './native-contract.mjs';
import { assertParentDist } from './parent-build-guard.mjs';
import { createSignedOtaBundle } from './ota-package-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const channels = JSON.parse(readFileSync(new URL('../ota-channels.json', import.meta.url), 'utf8'));
const parentContract = channels.googlePlayParents.contract;
const legacyContract = nativeContract();
if (legacyContract === parentContract) throw new Error('OTA contracts are not isolated.');
assertParentDist(path.join(root, 'dist-parents'));

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
const outputRoot = mkdtempSync(path.join(tmpdir(), 'warriors-dual-ota-'));

const verifyOutput = ({ contract, output, bundleId }) => {
  const envelope = JSON.parse(readFileSync(path.join(output, 'latest.json'), 'utf8'));
  if (!verify('RSA-SHA256', Buffer.from(envelope.payload), publicKey,
    Buffer.from(envelope.signature, 'base64'))) throw new Error(`Manifest verification failed for ${contract}.`);
  const manifest = JSON.parse(envelope.payload);
  const zip = readFileSync(path.join(output, `${bundleId}.zip`));
  if (manifest.contract !== contract || manifest.bundleId !== bundleId
    || createHash('sha256').update(zip).digest('hex') !== manifest.checksum
    || !verify('RSA-SHA256', zip, publicKey, Buffer.from(manifest.signature, 'base64'))) {
    throw new Error(`Bundle verification failed for ${contract}.`);
  }
};

try {
  const legacy = createSignedOtaBundle({
    distDir: path.join(root, 'dist'), outputRoot, contract: legacyContract, privateKey, publicKey
  });
  const parents = createSignedOtaBundle({
    distDir: path.join(root, 'dist-parents'), outputRoot, contract: parentContract, privateKey, publicKey
  });
  verifyOutput(legacy);
  verifyOutput(parents);
  if (legacy.output === parents.output || legacy.bundleId === parents.bundleId) {
    throw new Error('OTA outputs are not independently addressed.');
  }
  console.log(`Verified isolated local OTA channels: ${legacy.contract}, ${parents.contract}`);
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
