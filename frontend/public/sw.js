const CACHE_NAME = 'warriors-shell-v9';
const SHELL_ASSETS = ['/', '/login?source=pwa', '/parent/login?source=parent-pwa', '/admin/login?source=admin-pwa', '/manifest.webmanifest', '/admin-manifest.webmanifest', '/warriors-logo.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith('/api') || event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).then((response) => {
        if (requestUrl.origin === self.location.origin) {
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
  } catch (error) {
    data = { title: 'New message', body: event.data?.text() || '' };
  }

  const title = data.title || 'New message';
  const options = {
    body: data.body || data.message || '',
    icon: '/warriors-logo.png',
    badge: '/warriors-logo.png',
    tag: data.notificationId ? `parent-message-${data.notificationId}` : 'parent-message',
    data: { url: data.url || '/parent/notifications' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
