import { createHash, sign, verify } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { nativeContract } from './native-contract.mjs';

const contract = nativeContract();
const privateKey = process.env.OTA_SIGNING_PRIVATE_KEY?.replace(/\\n/g, '\n')
  || readFileSync(new URL('../.ota-secrets/signing-private.pem', import.meta.url), 'utf8');
const publicKey = readFileSync(new URL('../ota-public-key.pem', import.meta.url));
const files = {};
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) walk(new URL(entry.name + '/', dir), name + '/');
    else {
      if (/\.(?:apk|aab|dex|so|java|pem|map)$|google-services|firebase-adminsdk/i.test(name)) {
        throw new Error('Non-web or sensitive file in OTA: ' + name);
      }
      files[name] = new Uint8Array(readFileSync(new URL(entry.name, dir)));
    }
  }
};
walk(new URL('../dist/', import.meta.url));
if (!files['index.html']) throw new Error('Build the frontend first.');
const zip = zipSync(files, { level: 6 });
const checksum = createHash('sha256').update(zip).digest('hex');
const signature = sign('RSA-SHA256', zip, privateKey).toString('base64');
if (!verify('RSA-SHA256', zip, publicKey, Buffer.from(signature, 'base64'))) {
  throw new Error('Signing key does not match the public key built into the APK.');
}
const bundleId = checksum;
const payload = JSON.stringify({ contract, bundleId, checksum, signature });
const envelope = { payload, signature: sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64') };
const output = new URL('../../backend/public/ota/' + contract + '/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL(bundleId + '.zip', output), zip);
writeFileSync(new URL('latest.json', output), JSON.stringify(envelope));
console.log('Signed Android OTA bundle: ' + contract + '/' + bundleId);
