import { createHash, sign, verify } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { zipSync } from 'fflate';

const collectFiles = (dir, root = dir, files = {}) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, root, files);
    else {
      const name = path.relative(root, absolute).replaceAll('\\', '/');
      if (/\.(?:apk|aab|dex|so|java|pem|map)$|google-services|firebase-adminsdk/i.test(name)) {
        throw new Error(`Non-web or sensitive file in OTA: ${name}`);
      }
      files[name] = new Uint8Array(readFileSync(absolute));
    }
  }
  return files;
};

export const createSignedOtaBundle = ({ distDir, outputRoot, contract, privateKey, publicKey }) => {
  if (!/^android-[a-f0-9]{24}$/.test(contract)) throw new Error('Invalid OTA native contract.');
  const files = collectFiles(distDir);
  if (!files['index.html']) throw new Error('Build the frontend first.');
  const zip = zipSync(files, { level: 6 });
  const checksum = createHash('sha256').update(zip).digest('hex');
  const signature = sign('RSA-SHA256', zip, privateKey).toString('base64');
  if (!verify('RSA-SHA256', zip, publicKey, Buffer.from(signature, 'base64'))) {
    throw new Error('Signing key does not match the configured OTA public key.');
  }
  const payload = JSON.stringify({ contract, bundleId: checksum, checksum, signature });
  const envelope = {
    payload,
    signature: sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64')
  };
  const output = path.join(outputRoot, contract);
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, `${checksum}.zip`), zip);
  writeFileSync(path.join(output, 'latest.json'), JSON.stringify(envelope));
  return { bundleId: checksum, contract, output };
};

export const verifySignedOtaBundle = ({ outputRoot, contract, publicKey }) => {
  if (!/^android-[a-f0-9]{24}$/.test(contract)) throw new Error('Invalid OTA native contract.');
  const output = path.join(outputRoot, contract);
  const envelope = JSON.parse(readFileSync(path.join(output, 'latest.json'), 'utf8'));
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string'
    || !verify('RSA-SHA256', Buffer.from(envelope.payload), publicKey,
      Buffer.from(envelope.signature, 'base64'))) {
    throw new Error(`OTA manifest verification failed for ${contract}.`);
  }
  const manifest = JSON.parse(envelope.payload);
  if (manifest.contract !== contract || !/^[a-f0-9]{64}$/.test(manifest.bundleId)
    || manifest.bundleId !== manifest.checksum || typeof manifest.signature !== 'string') {
    throw new Error(`OTA manifest is incompatible for ${contract}.`);
  }
  const zip = readFileSync(path.join(output, `${manifest.bundleId}.zip`));
  if (createHash('sha256').update(zip).digest('hex') !== manifest.checksum
    || !verify('RSA-SHA256', zip, publicKey, Buffer.from(manifest.signature, 'base64'))) {
    throw new Error(`OTA bundle verification failed for ${contract}.`);
  }
  return { output, manifest, zip };
};
