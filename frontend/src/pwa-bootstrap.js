// Keep this external: the admin host's CSP blocks inline scripts.
const adminPaths = [
  '/admin', '/admin-login', '/players', '/groups', '/attendance',
  '/coaches', '/payments', '/notifications', '/parents', '/reports',
  '/history', '/security', '/audit-logs', '/owner-summary', '/media-gallery'
];
const isAdminApp = adminPaths.some((path) => (
  window.location.pathname === path || window.location.pathname.startsWith(`${path}/`)
));
const manifest = document.querySelector('link[rel="manifest"]') || document.createElement('link');
manifest.rel = 'manifest';
manifest.href = isAdminApp ? '/admin-manifest.webmanifest' : '/manifest.webmanifest';
if (!manifest.parentNode) document.head.appendChild(manifest);
document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', isAdminApp ? 'Admin' : 'Warriors');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__warriorsInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  window.__warriorsInstallPrompt = null;
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistration('/')
      .then((registration) => registration || navigator.serviceWorker.register('/sw.js', { scope: '/' }))
      .then((registration) => registration?.update?.().catch(() => undefined))
      .catch(console.error);
  });
}
