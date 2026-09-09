const CACHE_NAME = 'warriors-shell-v16';
const SHELL_ASSETS = ['/', '/login?source=pwa', '/parent/login?source=parent-pwa', '/admin/login?source=admin-pwa', '/manifest.webmanifest', '/admin-manifest.webmanifest', '/warriors-logo.png', '/warriors-icon-192.png', '/warriors-icon-512.png'];

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
