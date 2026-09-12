const CACHE_NAME = 'warriors-shell-v17';
const SHELL_ASSETS = ['/', '/login?source=pwa', '/parent/login?source=parent-pwa', '/admin/login?source=admin-pwa', '/manifest.webmanifest', '/admin-manifest.webmanifest', '/warriors-logo.png', '/warriors-icon-192.png', '/warriors-icon-512.png'];

const isAppShell = async (response) => response?.ok
  && (response.headers.get('content-type') || '').includes('text/html')
  && /<div\s+id=["']root["']/.test(await response.clone().text());

const loadingPage = () => new Response(`<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>Warriors Gymnastics</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#222;font:16px system-ui;text-align:center}img{width:100px;height:100px;object-fit:contain}.spinner{width:30px;height:30px;border:3px solid #eee;border-top-color:#d70b19;border-radius:50%;margin:24px auto;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style>
</head><body><main role="status"><img src="/warriors-logo.png" alt="Warriors Gymnastics"><div class="spinner"></div><p>Connecting to the server...</p></main></body></html>`, {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_ASSETS.map(async (url) => {
        const response = await fetch(url);
        const pathname = new URL(url, self.location.origin).pathname;
        const isPage = !/\.(png|webmanifest)$/.test(pathname);
        if (response.ok && (!isPage || await isAppShell(response))) await cache.put(url, response);
      })))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('warriors-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith('/api') || event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    const adminPaths = /^\/(admin(?:\/|$)|admin-login$|players|groups|attendance|coaches|payments|notifications|parents|reports|history|security|audit-logs|owner-summary|media-gallery)/;
    const shellUrl = adminPaths.test(requestUrl.pathname)
      ? '/admin/login?source=admin-pwa' : '/parent/login?source=parent-pwa';
    const cacheReady = caches.open(CACHE_NAME);
    // Never replace our UI with a hosting provider's wake-up/error page.
    event.waitUntil((async () => {
      try {
        const response = await fetch(event.request);
        if (await isAppShell(response)) await (await cacheReady).put(shellUrl, response);
      } catch { /* The saved app remains available while offline. */ }
    })());
    event.respondWith((async () => {
      const cached = await (await cacheReady).match(shellUrl);
      return await isAppShell(cached) ? cached : loadingPage();
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        if (response.ok && requestUrl.origin === self.location.origin
          && !(response.headers.get('content-type') || '').includes('text/html')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
    ))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/parent/notifications';
  const url = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const matchingClient = clientList.find((client) => client.url.startsWith(self.location.origin));
      if (matchingClient) {
        matchingClient.navigate(url);
        return matchingClient.focus();
      }
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
    if (!data || typeof data !== 'object') data = {};
  } catch (error) {
    data = { title: 'New message', body: event.data?.text() || '' };
  }

  const title = data.title || 'Warriors Gymnastics';
  const notificationId = data.notificationId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const options = {
    body: data.body || data.message || '',
    icon: data.icon || '/warriors-icon-192.png',
    badge: data.badge || '/warriors-icon-192.png',
    tag: data.testId ? `push-test-${data.testId}` : `parent-message-${notificationId}`,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: data.url || '/parent/notifications',
      notificationId
    }
  };

  event.waitUntil((async () => {
    let displayed = false;
    try {
      await self.registration.showNotification(title, options);
      displayed = true;
    } catch (error) {
      console.error('Unable to display push notification:', error);
    }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({
      type: 'push:receipt', testId: data.testId || '', notificationId, displayed
    }));
  })());
});
