import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export function nativeContract() {
  const hash = createHash('sha256');
  const files = ['capacitor.config.ts', 'ota-public-key.pem', 'android/app/build.gradle',
    'android/app/proguard-rules.pro', 'android/settings.gradle',
    'android/build.gradle', 'android/variables.gradle', 'android/gradle.properties',
    'android/gradle/wrapper/gradle-wrapper.properties'];
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = dir + '/' + entry.name;
      if (entry.isDirectory()) {
        if (name !== 'android/app/src/main/assets') walk(name);
      } else if (name !== 'android/app/src/main/res/xml/config.xml') files.push(name);
    }
  };
  walk('android/app/src/main');
  for (const file of files.sort()) {
    const content = readFileSync(path.join(root, file));
    hash.update(file).update(/\.(?:png|webp|jpg|jpeg|jar)$/.test(file)
      ? content : content.toString('utf8').replace(/\r\n/g, '\n'));
  }
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [name, info] of Object.entries(lock.packages).sort()) {
    let nativePlugin = false;
    if (name) {
      try { nativePlugin = Boolean(JSON.parse(readFileSync(path.join(root, name, 'package.json'), 'utf8')).capacitor); }
      catch { /* Optional dependencies may not be installed on this OS. */ }
    }
    if (name.includes('@capacitor/') || name.includes('@capawesome/') || nativePlugin) {
      hash.update(name + ':' + info.version + ':' + info.integrity);
    }
  }
  return 'android-' + hash.digest('hex').slice(0, 24);
}
