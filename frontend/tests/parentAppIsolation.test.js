import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(frontendRoot, 'src');
const parentEntry = resolve(sourceRoot, 'ParentApp.jsx');
const sourceExtensions = ['', '.js', '.jsx', '.ts', '.tsx'];
const importPattern = /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const resolveSourceImport = (importer, specifier, parentAliases = false) => {
  if (!specifier.startsWith('.')) return null;
  if (parentAliases && /(?:^|\/)context\/AuthContext\.jsx$/.test(specifier)) {
    return resolve(sourceRoot, 'context', 'ParentAuthContext.jsx');
  }
  if (parentAliases && /(?:^|\/)components\/Sidebar\.jsx$/.test(specifier)) {
    return resolve(sourceRoot, 'components', 'ParentSidebar.jsx');
  }
  const target = resolve(dirname(importer), specifier);
  for (const extension of sourceExtensions) {
    const candidate = target + extension;
    if (existsSync(candidate)) return candidate;
  }
  return null;
};

const collectReachableSources = (start, parentAliases = false) => {
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file) || !['.js', '.jsx', '.ts', '.tsx'].includes(extname(file))) return;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveSourceImport(file, match[1] || match[2], parentAliases);
      if (dependency) visit(dependency);
    }
  };
  visit(start);
  return visited;
};

test('parent entry contains every existing parent route and no admin route', () => {
  const source = readFileSync(resolve(sourceRoot, 'ParentApp.jsx'), 'utf8');
  for (const route of [
    '/parent', '/parent/attendance', '/parent/payments', '/parent/notifications',
    '/parent/settings', '/parent/children', '/parent/subscriptions', '/parent/notifications/:id'
  ]) {
    assert.match(source, new RegExp(`path=["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  }
  for (const route of ['/admin', '/players', '/groups', '/attendance', '/coaches', '/payments', '/owner-summary']) {
    assert.doesNotMatch(source, new RegExp(`path=["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`));
  }
});

test('parent production entry cannot reach admin page modules', () => {
  const reachable = collectReachableSources(parentEntry, true);
  const forbiddenPages = [
    'AdminPasswordRecovery.jsx', 'AdminDashboard.jsx', 'Players.jsx', 'PlayerForm.jsx',
    'PlayerProfile.jsx', 'Groups.jsx', 'Attendance.jsx', 'Coaches.jsx', 'CoachProfile.jsx',
    'Payments.jsx', 'OwnerDashboard.jsx', 'Notifications.jsx', 'Reports.jsx', 'History.jsx',
    'AuditLogs.jsx', 'Parents.jsx', 'ClubMedia.jsx', 'PublicHome.jsx', 'Login.jsx'
  ];
  const leaked = [...reachable].filter((file) => forbiddenPages.includes(file.split(/[\\/]/).at(-1)));
  assert.deepEqual(leaked, []);
  assert.ok(reachable.has(resolve(sourceRoot, 'ParentApp.jsx')));
  assert.ok(reachable.has(resolve(sourceRoot, 'pages', 'ParentDashboard.jsx')));
  assert.ok(reachable.has(resolve(sourceRoot, 'pages', 'ParentLogin.jsx')));
});

test('the default shell stays unchanged and parent mode swaps only its bootstrap', () => {
  const html = readFileSync(resolve(frontendRoot, 'index.html'), 'utf8');
  const bootstrap = readFileSync(resolve(sourceRoot, 'parent-pwa-bootstrap.js'), 'utf8');
  const viteConfig = readFileSync(resolve(frontendRoot, 'vite.config.js'), 'utf8');
  assert.match(html, /src\/pwa-bootstrap\.js/);
  assert.match(viteConfig, /replace\('\/src\/pwa-bootstrap\.js', '\/src\/parent-pwa-bootstrap\.js'\)/);
  assert.match(bootstrap, /parent-manifest\.webmanifest/);
  assert.doesNotMatch(bootstrap, /admin|owner-summary|media-gallery/i);
});

test('parent entry preserves native OTA lifecycle without changing its implementation', () => {
  const reachable = collectReachableSources(parentEntry, true);
  assert.ok(reachable.has(resolve(sourceRoot, 'components', 'NativeAppLifecycle.jsx')));
  assert.ok(reachable.has(resolve(sourceRoot, 'services', 'androidLiveUpdate.js')));
});

test('default entry still resolves to the full application', () => {
  const main = readFileSync(resolve(sourceRoot, 'main.jsx'), 'utf8');
  const viteConfig = readFileSync(resolve(frontendRoot, 'vite.config.js'), 'utf8');
  assert.match(main, /from ['"]@app-entry['"]/);
  assert.match(viteConfig, /parentsOnly \? 'ParentApp\.jsx' : 'App\.jsx'/);
  assert.match(readFileSync(resolve(sourceRoot, 'App.jsx'), 'utf8'), /path=["']\/admin/);
});
