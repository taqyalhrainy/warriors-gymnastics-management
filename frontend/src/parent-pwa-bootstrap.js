// Keep this external so the production CSP does not require inline scripts.
const manifest = document.querySelector('link[rel="manifest"]') || document.createElement('link');
manifest.rel = 'manifest';
manifest.href = '/parent-manifest.webmanifest';
if (!manifest.parentNode) document.head.appendChild(manifest);
document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'Warriors');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__warriorsInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  window.__warriorsInstallPrompt = null;
});

if (!window.Capacitor?.isNativePlatform?.() && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistration('/')
      .then((registration) => registration || navigator.serviceWorker.register('/sw.js', { scope: '/' }))
      .then((registration) => registration?.update?.().catch(() => undefined))
      .catch(console.error);
  });
}
