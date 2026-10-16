import { createHash, createPublicKey } from 'node:crypto';

export const publicKeyFingerprint = (publicKey) => {
  const der = createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
};
