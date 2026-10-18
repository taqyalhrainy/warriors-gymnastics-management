import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext.jsx';

const GUARDED_BACKDROP_SELECTOR = [
  '.student-modal-backdrop:not(.unsaved-exit-backdrop)',
  '.profile-image-preview-backdrop'
].join(',');

const isGuardedBackdrop = (target) => (
  target instanceof Element
  && target.matches(GUARDED_BACKDROP_SELECTOR)
  && Boolean(target.querySelector('[role="dialog"][aria-modal="true"]'))
);

export default function AdminModalExitGuard() {
  const { language } = useLanguage();
  const [pendingBackdrop, setPendingBackdrop] = useState(null);
  const replayingClickRef = useRef(false);

  useEffect(() => {
    const interceptOutsideClick = (event) => {
      if (replayingClickRef.current || pendingBackdrop || event.button !== 0 || !isGuardedBackdrop(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPendingBackdrop(event.target);
    };

    document.addEventListener('click', interceptOutsideClick, true);
    return () => document.removeEventListener('click', interceptOutsideClick, true);
  }, [pendingBackdrop]);

  if (!pendingBackdrop) return null;

  const copy = language === 'ar'
    ? {
      title: 'إغلاق النافذة؟',
      message: 'هل تريد إبقاء النافذة مفتوحة أم الخروج منها؟ أي تغييرات غير محفوظة ستُفقد.',
      keep: 'إبقاء النافذة',
      exit: 'الخروج'
    }
    : {
      title: 'Close this window?',
      message: 'Keep this popup open or exit it? Any unsaved changes will be lost.',
      keep: 'Keep open',
      exit: 'Exit popup'
    };

  const keepOpen = () => setPendingBackdrop(null);
  const exitPopup = () => {
    const backdrop = pendingBackdrop;
    setPendingBackdrop(null);
    if (!backdrop?.isConnected) return;

    replayingClickRef.current = true;
    try {
      const confirmedClick = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      Object.defineProperty(confirmedClick, 'modalExitConfirmed', { value: true });
      backdrop.dispatchEvent(confirmedClick);
    } finally {
      replayingClickRef.current = false;
    }
  };

  return createPortal(
    <div
      className="student-modal-backdrop unsaved-exit-backdrop global-modal-exit-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) keepOpen();
      }}
    >
      <section className="unsaved-exit-dialog" role="dialog" aria-modal="true" aria-label={copy.title} onClick={(event) => event.stopPropagation()}>
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.message}</p>
        </div>
        <div className="unsaved-exit-actions">
          <button type="button" className="btn-secondary" autoFocus onClick={keepOpen}>{copy.keep}</button>
          <button type="button" className="btn-primary" onClick={exitPopup}>{copy.exit}</button>
        </div>
      </section>
    </div>,
    document.body
  );
}
