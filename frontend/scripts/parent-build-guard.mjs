import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const allowedParentPages = new Set([
  'ParentAttendance.jsx',
  'ParentChildren.jsx',
  'ParentDashboard.jsx',
  'ParentLogin.jsx',
  'ParentNotificationDetail.jsx',
  'ParentNotifications.jsx',
  'ParentPayments.jsx',
  'ParentSettings.jsx',
  'ParentSubscriptionSummary.jsx'
]);

const forbiddenModules = [
  '/src/App.jsx',
  '/src/components/Sidebar.jsx',
  '/src/components/ProtectedRoute.jsx',
  '/src/context/AuthContext.jsx',
  '/src/services/prefetch.js'
];

const normalize = (value) => value.replaceAll('\\', '/');

export const assertParentModuleIds = (moduleIds) => {
  const violations = new Set();
  for (const rawId of moduleIds) {
    const id = normalize(rawId.split('?')[0]);
    if (forbiddenModules.some((suffix) => id.endsWith(suffix))) violations.add(id);
    const pageMatch = id.match(/\/src\/pages\/([^/]+)$/);
    if (pageMatch && !allowedParentPages.has(pageMatch[1])) violations.add(id);
  }
  if (violations.size) {
    throw new Error(`Parent build contains forbidden modules:\n${[...violations].sort().join('\n')}`);
  }
};

const walk = (dir, relative = '') => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(path.join(dir, entry.name), name));
    else files.push(name);
  }
  return files;
};

export const assertParentDist = (distDir) => {
  if (!existsSync(path.join(distDir, 'index.html'))) throw new Error('Parent build has no index.html.');
  const files = walk(distDir);
  const contents = Object.fromEntries(files.map((file) => [file, readFileSync(path.join(distDir, file))]));
  assertParentBundleFiles(contents);
  return files;
};

export const assertParentBundleFiles = (contents) => {
  const files = Object.keys(contents);
  if (!files.includes('index.html')) throw new Error('Parent bundle has no index.html.');
  const forbiddenNames = files.filter((file) => /(?:^|\/)(?:admin-manifest|sw)\.(?:js|webmanifest)$/i.test(file));
  if (forbiddenNames.length) {
    throw new Error(`Parent build contains forbidden public files: ${forbiddenNames.join(', ')}`);
  }
  const scripts = files.filter((file) => file.endsWith('.js'));
  const forbiddenRuntime = /(?:AdminDashboard|AdminLogin|AdminLayout|OwnerDashboard|OwnerSummary|path\s*:\s*["']\/(?:admin|owner-summary))/;
  const leaked = scripts.filter((file) => forbiddenRuntime.test(Buffer.from(contents[file]).toString('utf8')));
  if (leaked.length) throw new Error(`Parent build contains admin runtime code: ${leaked.join(', ')}`);
  return files;
};
