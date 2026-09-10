import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const privateFile = new URL('../.ota-secrets/signing-private.pem', import.meta.url);
const publicFile = new URL('../ota-public-key.pem', import.meta.url);
if (existsSync(privateFile) || existsSync(publicFile)) throw new Error('OTA keys already exist; refusing to overwrite them.');
const keys = generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
mkdirSync(new URL('../.ota-secrets/', import.meta.url), { recursive: true });
writeFileSync(privateFile, keys.privateKey, { mode: 0o600 });
writeFileSync(publicFile, keys.publicKey);
console.log('OTA keys created. Keep .ota-secrets/signing-private.pem private and backed up.');
