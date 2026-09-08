import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const isStandalone = () => (
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true
);

const getPlatform = () => {
  const userAgent = window.navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    isIOS,
    isStandalone: isStandalone()
  };
};

const InstallAppButton = ({ className = '' }) => {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => typeof window !== 'undefined' && isStandalone());
  const [modalMode, setModalMode] = useState('');
  const appUrl = useMemo(() => window.location.origin, []);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(appUrl)}`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setModalMode('');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstall = async () => {
    const platform = getPlatform();
    if (platform.isStandalone) {
      setIsInstalled(true);
      return;
    }
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }
    setModalMode(platform.isIOS ? 'ios' : 'qr');
  };

  const modal = modalMode ? createPortal(
    <div className="install-modal-backdrop" role="presentation" onClick={() => setModalMode('')}>
      <section className="install-modal" role="dialog" aria-modal="true" aria-label="Install Warriors app" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="install-modal-close" onClick={() => setModalMode('')} aria-label="Close">x</button>
        {modalMode === 'ios' ? (
          <>
            <span className="landing-kicker">Install on iPhone</span>
            <h2>Add Warriors to your Home Screen</h2>
            <ol className="ios-install-steps">
              <li><strong>1</strong><span>Tap the Safari Share button.</span></li>
              <li><strong>2</strong><span>Choose Add to Home Screen.</span></li>
              <li><strong>3</strong><span>Tap Add.</span></li>
            </ol>
          </>
        ) : (
          <>
            <span className="landing-kicker">Install on phone</span>
            <h2>Scan to open the app</h2>
            <img className="install-qr" src={qrUrl} alt="QR code for Warriors Gymnastics website" />
            <p>Open this link on your phone, then use your browser install option.</p>
          </>
        )}
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button type="button" className={`install-app-button ${className}`} onClick={handleInstall}>
        Install App
      </button>
      {modal}
    </>
  );
};

export default InstallAppButton;
