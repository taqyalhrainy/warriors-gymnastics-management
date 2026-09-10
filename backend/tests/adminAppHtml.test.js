const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const adminAppHtml = require('../utils/adminAppHtml');

test('admin QR HTML advertises only the admin manifest before JavaScript runs', () => {
  const html = '<head><title>Warriors</title><link rel="manifest" href="/manifest.webmanifest" /><meta name="apple-mobile-web-app-title" content="Warriors" /></head>';
  const result = adminAppHtml(html);
  assert.equal((result.match(/rel="manifest"/g) || []).length, 1);
  assert.ok(result.includes('href="/admin-manifest.webmanifest"'));
  assert.ok(!result.includes('href="/manifest.webmanifest"'));
  assert.ok(result.includes('content="Admin"'));
  assert.equal(adminAppHtml(result), result);
});

test('current frontend shell has no premature parent manifest and admin start URL stays dedicated', () => {
  const root = path.join(__dirname, '../../frontend');
  const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(!shell.includes('href="/manifest.webmanifest"'));
  assert.ok(adminAppHtml(shell).includes('href="/admin-manifest.webmanifest"'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/admin-manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/admin/login?source=admin-pwa');
  assert.equal(manifest.id, '/admin-pwa');
});
