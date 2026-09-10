import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';
import { nativeContract } from './scripts/native-contract.mjs';

const publicKey = readFileSync(new URL('./ota-public-key.pem', import.meta.url), 'utf8');
const config: CapacitorConfig = {
  appId: 'com.warriorsgymnastics.app',
  appName: 'Warriors Gymnastics',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    PushNotifications: { presentationOptions: ['alert', 'sound', 'badge'] },
    LiveUpdate: {
      publicKey,
      defaultChannel: nativeContract(),
      readyTimeout: 20000,
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      autoUpdateStrategy: 'none'
    },
    NativePushSession: {
      otaOrigin: 'https://warriors-gymnastics-management.onrender.com',
      apiOrigin: 'https://warriors-gymnastics-management.onrender.com'
    }
  }
};
export default config;
