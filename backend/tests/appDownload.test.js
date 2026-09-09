const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const createRouter = require('../routes/appDownload');

test('parent QR serves Android APK and preserves iPhone web login', async (t) => {
  const app = express();
  app.use(createRouter({ getFrontendOrigin: () => 'https://parent.example' }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => { server.closeAllConnections(); server.close(); });
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;

  for (const agent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'Mozilla/5.0 (iPad)']) {
    const response = await fetch(`${origin}/open-parent`, { headers: { 'User-Agent': agent }, redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://parent.example/parent/login?source=parent-pwa');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('vary'), /User-Agent/);
  }
  const android = await fetch(`${origin}/open-parent`, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' }, redirect: 'manual' });
  assert.equal(android.status, 302);
  assert.equal(android.headers.get('location'), '/downloads/Warriors-Parent-1.1.apk');

  const download = await fetch(`${origin}${android.headers.get('location')}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /application\/vnd.android.package-archive/);
  assert.match(download.headers.get('content-disposition'), /attachment; filename="Warriors-Parent-1.1.apk"/);
  const expected = readFileSync(path.join(__dirname, '../downloads/Warriors-Parent-1.1.apk'));
  const actual = Buffer.from(await download.arrayBuffer());
  assert.equal(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(expected).digest('hex'));
});
