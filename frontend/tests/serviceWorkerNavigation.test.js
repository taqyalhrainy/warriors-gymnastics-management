import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const shell = (text) => new Response(`<html><div id="root">${text}</div></html>`, { headers: { 'Content-Type': 'text/html' } });
const setup = (network, initial = {}) => {
  const handlers = {};
  const stored = new Map(Object.entries(initial));
  const cache = { match: async (key) => stored.get(key)?.clone(), put: async (key, response) => stored.set(key, response.clone()) };
  vm.runInNewContext(source, {
    self: { location: { origin: 'https://gym.example' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    URL, Response, fetch: network, caches: { open: async () => cache }
  });
  return { stored, navigate(path) {
    let response, background;
    handlers.fetch({ request: { url: `https://gym.example${path}`, method: 'GET', mode: 'navigate' },
      respondWith: (value) => { response = value; }, waitUntil: (value) => { background = value; } });
    return { response, background };
  } };
};

test('saved admin interface opens immediately while the server is still waking', async () => {
  let resolve;
  const app = setup(() => new Promise((done) => { resolve = done; }), {
    '/admin/login?source=admin-pwa': shell('Admin'), '/parent/login?source=parent-pwa': shell('Parent')
  });
  const result = app.navigate('/admin/login');
  assert.match(await (await result.response).text(), /Admin/);
  resolve(new Response('Render is starting', { status: 503 }));
  await result.background;
  assert.match(await app.stored.get('/admin/login?source=admin-pwa').text(), /Admin/);
});

test('even a 200 hosting page is never displayed or cached as the app', async () => {
  const app = setup(async () => new Response('<html>Render loading</html>', { headers: { 'Content-Type': 'text/html' } }));
  const result = app.navigate('/parent');
  const html = await (await result.response).text();
  assert.match(html, /Connecting to the server/);
  assert.doesNotMatch(html, /Render loading/);
  await result.background;
  assert.equal(app.stored.size, 0);
});

test('valid shell refresh stays separate for parent and admin; offline startup keeps branding', async () => {
  const app = setup(async () => shell('New Admin'), { '/parent/login?source=parent-pwa': shell('Parent') });
  const result = app.navigate('/security');
  await result.background;
  assert.match(await app.stored.get('/admin/login?source=admin-pwa').text(), /New Admin/);
  assert.match(await app.stored.get('/parent/login?source=parent-pwa').text(), /Parent/);
  const offline = setup(async () => { throw new Error('offline'); });
  const retry = offline.navigate('/parent');
  assert.match(await (await retry.response).text(), /Warriors Gymnastics/);
  await retry.background;
});
