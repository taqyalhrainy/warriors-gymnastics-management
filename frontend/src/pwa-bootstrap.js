// Keep this external: the admin host's CSP blocks inline scripts.
const adminPaths = [
  '/admin', '/admin-login', '/players', '/groups', '/attendance',
  '/coaches', '/payments', '/notifications', '/parents', '/reports',
  '/history', '/security', '/audit-logs', '/owner-summary', '/media-gallery'
];
const isAdminApp = adminPaths.some((path) => (
  window.location.pathname === path || window.location.pathname.startsWith(`${path}/`)
));
const manifest = document.createElement('link');
manifest.rel = 'manifest';
manifest.href = isAdminApp ? '/admin-manifest.webmanifest' : '/manifest.webmanifest';
document.head.appendChild(manifest);
document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', isAdminApp ? 'Admin' : 'Warriors');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__warriorsInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  window.__warriorsInstallPrompt = null;
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(console.error);
}
