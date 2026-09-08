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

const getAndroidChromeIntentUrl = (url) => {
  try {
    const parsed = new URL(url);
    return `intent://${parsed.host}${parsed.pathname}${parsed.search}#Intent;scheme=${parsed.protocol.replace(':', '')};package=com.android.chrome;end`;
  } catch {
    return url;
  }
};

const InstallAppButton = ({ className = '', label = 'Install App', installPath = '', appName = 'Warriors app' }) => {
  const isAdminInstall = installPath.startsWith('/admin-login');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== 'undefined' && isStandalone());
  const [modalMode, setModalMode] = useState('');
  const [platform, setPlatform] = useState(() => typeof window === 'undefined' ? {} : getPlatform());
  const appUrl = useMemo(() => `${window.location.origin}${installPath}`, [installPath]);
  const androidChromeIntentUrl = useMemo(() => getAndroidChromeIntentUrl(appUrl), [appUrl]);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}`;

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

  if (isInstalled && !isAdminInstall) return null;

  if (isInstalled && isAdminInstall) {
    return (
      <a className={`install-app-button ${className}`} href={androidChromeIntentUrl} target="_blank" rel="noreferrer">
        Open Admin in Chrome
      </a>
    );
  }

  const handleInstall = async () => {
    const platform = getPlatform();
    if (platform.isStandalone) {
      setIsInstalled(true);
      return;
    }
    const promptEvent = installPrompt || window.__warriorsInstallPrompt;
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
      window.__warriorsInstallPrompt = null;
      return;
    }
    if (platform.isIOS) {
      setModalMode(platform.isSafari ? 'ios' : 'ios-browser');
      return;
    }
    setModalMode(platform.isAndroid ? 'android-browser' : 'qr');
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
        ) : modalMode === 'android-browser' ? (
          <>
            <span className="landing-kicker">Install unavailable</span>
            <h2>Open in Chrome</h2>
            <p>This browser did not expose the native install prompt. Open this site in Chrome, then tap Install App.</p>
            {isAdminInstall && (
              <>
                <a className="install-app-button" href={androidChromeIntentUrl} target="_blank" rel="noreferrer">Open Admin in Chrome</a>
                <button
                  type="button"
                  className="install-app-button is-secondary"
                  onClick={() => navigator.clipboard?.writeText(appUrl)}
                >
                  Copy Admin Link
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <span className="landing-kicker">Install on phone</span>
            <h2>Scan to open {appName}</h2>
            <img className="install-qr" src={qrUrl} alt={`QR code for ${appName}`} />
            <p>{isAdminInstall ? 'Scan on Android to open Admin in Chrome, then tap Install Admin Application.' : 'Open this link on your phone, then use your browser install option.'}</p>
          </>
        )}
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button type="button" className={`install-app-button ${className}`} onClick={handleInstall}>
        {isAdminInstall && isInstalled ? 'Open Admin Install' : label}
      </button>
      {modal}
    </>
  );
};

export default InstallAppButton;
