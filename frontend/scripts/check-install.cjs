const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Reproduce the admin host's security policy without connecting to its database.
const root = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{}');
  }
  const relative = pathname.startsWith('/admin/') || pathname.startsWith('/parent/') ? '/index.html' : pathname;
  const file = path.join(root, relative);
  const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }[path.extname(file)];
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' https: data:");
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', type || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/admin/login`);
    await page.locator('button.install-app-button').waitFor();
    const cdp = await page.context().newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.equal(JSON.parse(manifest.data).name, 'Admin');
    const errors = (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors.filter(e => e.errorId !== 'in-incognito');
    assert.deepEqual(errors, [], JSON.stringify(errors));
    console.log('Admin manifest and Chrome installability: PASS');
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.promptCalls = (window.promptCalls || 0) + 1; };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    await page.locator('button.install-app-button').click();
    await page.locator('button.install-app-button').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.promptCalls), 1);
    assert.equal(await page.getByRole('dialog').count(), 0);
    console.log('Native prompt dispatch and accepted state: PASS (simulated browser event)');
    await page.goto(`${origin}/parent/login`);
    await page.locator('link[rel="manifest"]').waitFor({ state: 'attached' });
    assert.match(await page.locator('link[rel="manifest"]').getAttribute('href'), /^\/manifest\.webmanifest$/);
    console.log('Parent manifest selection: PASS');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
