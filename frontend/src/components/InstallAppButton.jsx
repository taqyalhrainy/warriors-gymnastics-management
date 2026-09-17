import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { isNativeAndroidApp } from '../utils/nativePushNotifications.js';
import { getInstallPlatform, withInstallTimeout } from '../utils/installPlatform.js';

const parentDownloadUrl = 'https://warriors-gymnastics-management.onrender.com/open-parent';

const isStandalone = () => (
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true
);

const getPlatform = () => getInstallPlatform(window.navigator, isStandalone());

const InstallAppButton = ({ className = '', label = 'Install App', installPath = '', appName = 'Warriors app' }) => {
  const isAdminInstall = installPath.startsWith('/admin/login') || installPath.startsWith('/admin-login');
  const [installPrompt, setInstallPrompt] = useState(() => window.__warriorsInstallPrompt || null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== 'undefined' && isStandalone());
  const [modalMode, setModalMode] = useState('');
  const [installMessage, setInstallMessage] = useState('');
  const [installBusy, setInstallBusy] = useState(false);
  const appUrl = useMemo(() => `${window.location.origin}${installPath}`, [installPath]);
  const qrTargetUrl = !isAdminInstall
    ? parentDownloadUrl
    : !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? 'https://warriors-gymnastics-management.onrender.com/open-admin'
    : appUrl;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrTargetUrl)}`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      window.__warriorsInstallPrompt = event;
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      window.__warriorsInstallPrompt = null;
      setModalMode('');
    };
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = () => setIsInstalled(isStandalone());

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode?.addEventListener?.('change', handleDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    const currentPlatform = getPlatform();
    if (
      !isAdminInstall
      || !currentPlatform.isAndroid
      || currentPlatform.isStandalone
      || !('serviceWorker' in navigator)
      || navigator.serviceWorker.controller
      || sessionStorage.getItem('warriors-admin-pwa-controlled') === 'true'
    ) {
      return;
    }

    navigator.serviceWorker.ready.then(() => {
      if (!navigator.serviceWorker.controller) {
        sessionStorage.setItem('warriors-admin-pwa-controlled', 'true');
        window.location.reload();
      }
    }).catch(() => undefined);
  }, [isAdminInstall]);

  if (isNativeAndroidApp()) return null;
  if (isInstalled && !isAdminInstall) return null;
  if (isInstalled && isAdminInstall) return null;

  const prepareAndroidInstall = async () => {
    setModalMode('android-wait');
    setInstallMessage('Preparing installation...');
    setInstallBusy(true);
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setModalMode('manual');
      setInstallBusy(false);
      return;
    }

    try {
      await withInstallTimeout((async () => {
        const registration = await navigator.serviceWorker.getRegistration('/')
          || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await registration.update?.();
        await navigator.serviceWorker.ready;
      })());
      setModalMode('manual');
    } catch {
      setModalMode('manual');
    } finally { setInstallBusy(false); }
  };

  const handleInstall = async () => {
    if (installBusy) return;
    const platform = getPlatform();
    if (platform.isStandalone) {
      setIsInstalled(true);
      return;
    }
    const promptEvent = installPrompt || window.__warriorsInstallPrompt;
    if (promptEvent) {
      setInstallPrompt(null);
      window.__warriorsInstallPrompt = null;
      setInstallBusy(true);
      setModalMode('android-wait');
      setInstallMessage('Opening installation...');
      try {
        await withInstallTimeout(promptEvent.prompt());
        const choice = await withInstallTimeout(promptEvent.userChoice, 60000);
        setModalMode(choice?.outcome === 'accepted' ? '' : 'manual');
      } catch {
        setModalMode('manual');
      } finally {
        setInstallPrompt(null);
        window.__warriorsInstallPrompt = null;
        setInstallBusy(false);
      }
      return;
    }
    if (platform.isIOS) {
      setModalMode(platform.isSafari ? 'ios' : 'ios-browser');
      return;
    }
    if (platform.isMobile) {
      await prepareAndroidInstall();
      return;
    }
    setModalMode('qr');
  };

  const modal = modalMode ? createPortal(
    <div className={`install-modal-backdrop ${modalMode.startsWith('ios') ? 'is-bottom-sheet' : ''}`} role="presentation" onClick={() => setModalMode('')}>
      <section className="install-modal" role="dialog" aria-modal="true" aria-label={`Install ${appName}`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="install-modal-close" onClick={() => setModalMode('')} aria-label="Close">x</button>
        {modalMode === 'ios' ? (
          <>
            <span className="landing-kicker">Install {appName} on iPhone</span>
            <h2>Add to Home Screen</h2>
            <div className="ios-install-flow" aria-label="iOS install steps">
              <span>Share</span><b>→</b><span>Add to Home Screen</span><b>→</b><span>Add</span>
            </div>
          </>
        ) : modalMode === 'ios-browser' ? (
          <>
            <span className="landing-kicker">Open in Safari</span>
            <h2>Use Safari to add the app</h2>
            <div className="ios-install-flow" aria-label="iOS install steps">
              <span>Safari</span><b>→</b><span>Share</span><b>→</b><span>Add</span>
            </div>
          </>
        ) : modalMode === 'android-wait' ? (
          <>
            <span className="landing-kicker">Android install</span>
            <h2>Install App</h2>
            <p>{installMessage || 'Refresh this page, then tap Install App again when Chrome is ready.'}</p>
          </>
        ) : modalMode === 'manual' ? (
          <>
            <h2>Install {appName}</h2>
            <p>Browser menu (&#8942;) &#8594; Add to Home screen &#8594; Install</p>
            <p>If opened inside WhatsApp, Facebook or a scanner, open this page in Chrome first.</p>
            {(installPrompt || window.__warriorsInstallPrompt) && <button type="button" className="btn-primary" onClick={handleInstall} disabled={installBusy}>Install {appName}</button>}
            <a href={appUrl}>Open {appName}</a>
          </>
        ) : (
          <>
            <span className="landing-kicker">Install on phone</span>
            <h2>Scan to open {appName}</h2>
            <img className="install-qr" src={qrUrl} alt={`QR code for ${appName}`} />
            <p>{isAdminInstall ? 'Scan on Android, then tap Install Admin Application.' : 'Open this link on your phone, then use your browser install option.'}</p>
          </>
        )}
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button type="button" className={`install-app-button ${className}`} onClick={handleInstall} disabled={installBusy}>
        {installBusy ? 'Please wait...' : label}
      </button>
      {modal}
    </>
  );
};

export default InstallAppButton;
