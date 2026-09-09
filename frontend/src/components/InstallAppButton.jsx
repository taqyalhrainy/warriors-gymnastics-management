import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const isStandalone = () => (
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true
);

const getPlatform = () => {
  const userAgent = window.navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(userAgent);
  return {
    isAndroid,
    isIOS,
    isSafari,
    isStandalone: isStandalone()
  };
};

const InstallAppButton = ({ className = '', label = 'Install App', installPath = '', appName = 'Warriors app' }) => {
  const isAdminInstall = installPath.startsWith('/admin/login') || installPath.startsWith('/admin-login');
  const [installPrompt, setInstallPrompt] = useState(() => window.__warriorsInstallPrompt || null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== 'undefined' && isStandalone());
  const [modalMode, setModalMode] = useState('');
  const [installMessage, setInstallMessage] = useState('');
  const [platform, setPlatform] = useState(() => typeof window === 'undefined' ? {} : getPlatform());
  const appUrl = useMemo(() => `${window.location.origin}${installPath}`, [installPath]);
  const qrTargetUrl = isAdminInstall && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? 'https://warriors-gymnastics-management.onrender.com/open-admin'
    : appUrl;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrTargetUrl)}`;

  useEffect(() => {
    setPlatform(getPlatform());
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

  if (isInstalled && !isAdminInstall) return null;
  if (isInstalled && isAdminInstall) return null;

  const prepareAndroidInstall = async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setModalMode('android-wait');
      setInstallMessage('Open this site with HTTPS in Chrome, then tap Install App again.');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration('/')
        || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await registration.update?.().catch(() => undefined);
      await navigator.serviceWorker.ready;
      setModalMode('android-wait');
      setInstallMessage('Chrome is preparing the real app install. Close this message and tap Install App again in a few seconds.');
      window.setTimeout(() => {
        const promptEvent = window.__warriorsInstallPrompt;
        if (promptEvent) {
          setInstallPrompt(promptEvent);
          setModalMode('');
        }
      }, 2500);
    } catch {
      setModalMode('android-wait');
      setInstallMessage('Chrome could not prepare the real app install yet. Please open this page in Chrome and try again.');
    }
  };

  const handleInstall = async () => {
    const platform = getPlatform();
    if (platform.isStandalone) {
      setIsInstalled(true);
      return;
    }
    const promptEvent = installPrompt || window.__warriorsInstallPrompt;
    if (promptEvent) {
      setModalMode('');
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') setIsInstalled(true);
      } catch {
        setModalMode('manual');
      } finally {
        setInstallPrompt(null);
        window.__warriorsInstallPrompt = null;
      }
      return;
    }
    if (platform.isIOS) {
      setModalMode(platform.isSafari ? 'ios' : 'ios-browser');
      return;
    }
    if (platform.isAndroid) {
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
      <button type="button" className={`install-app-button ${className}`} onClick={handleInstall}>
        {label}
      </button>
      {modal}
    </>
  );
};

export default InstallAppButton;
