import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const source = fileURLToPath(new URL('../', import.meta.url));
const requested = process.argv[2] || process.env.PARENT_ANDROID_WORKSPACE;
if (!requested) throw new Error('Pass an empty target directory for the generated parent Android workspace.');
const target = path.resolve(requested);
if (target === source || target.startsWith(source + path.sep)) {
  throw new Error('The generated parent Android workspace must be outside the source frontend.');
}
if (existsSync(target) && readdirSync(target).length) throw new Error('Target directory must be empty.');
mkdirSync(target, { recursive: true });

const excludedNames = new Set(['node_modules', 'dist', 'dist-parents', 'build', '.gradle', '.ota-secrets']);
const sensitive = (name) => /(?:^|[\\/])(?:google-services\.json|local\.properties|\.env(?:\..*)?|.*firebase-adminsdk.*\.json|.*\.(?:jks|keystore)|.*private.*\.pem|signing-private\.pem)$/i.test(name);
cpSync(source, target, {
  recursive: true,
  filter: (entry) => {
    const relative = path.relative(source, entry);
    if (!relative) return true;
    if (relative.split(path.sep).some((part) => excludedNames.has(part))) return false;
    return !sensitive(relative);
  }
});

const replaceExactly = (relative, before, after) => {
  const file = path.join(target, relative);
  const value = readFileSync(file, 'utf8');
  if (value.split(before).length !== 2) throw new Error(`Unexpected identity template in ${relative}.`);
  writeFileSync(file, value.replace(before, after));
};
replaceExactly('capacitor.config.ts', "appId: 'com.warriorsgymnastics.app'", "appId: 'com.warriorsgymnastics.parents'");
replaceExactly('android/app/build.gradle', 'applicationId "com.warriorsgymnastics.app"', 'applicationId "com.warriorsgymnastics.parents"');
replaceExactly('android/app/src/main/res/values/strings.xml',
  '<string name="package_name">com.warriorsgymnastics.app</string>',
  '<string name="package_name">com.warriorsgymnastics.parents</string>');
replaceExactly('android/app/src/main/res/values/strings.xml',
  '<string name="custom_url_scheme">com.warriorsgymnastics.app</string>',
  '<string name="custom_url_scheme">com.warriorsgymnastics.parents</string>');

const channels = JSON.parse(readFileSync(path.join(target, 'ota-channels.json'), 'utf8'));
const generatedContract = (await import(`${pathToFileURL(path.join(target, 'scripts/native-contract.mjs'))}?generated`))
  .nativeContract();
if (generatedContract !== channels.googlePlayParents.contract) {
  throw new Error(`Generated parent native contract changed unexpectedly: ${generatedContract}`);
}

const marker = {
  generatedFrom: 'single-source-parent-android-workspace',
  appId: 'com.warriorsgymnastics.parents',
  nativeContract: generatedContract,
  webBuildCommand: 'npx vite build --mode parents --outDir dist',
  firebaseFileRequiredAt: 'android/app/google-services.json'
};
writeFileSync(path.join(target, '.prepared-parent-android.json'), JSON.stringify(marker, null, 2));
console.log(`Prepared isolated parent Android workspace: ${target}`);
