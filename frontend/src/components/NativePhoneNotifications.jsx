import { useEffect, useState } from 'react';
import {
  getNativeNotificationStatus, enableNativeNotifications, disableNativeNotifications
} from '../services/nativeNotifications.js';

const NativePhoneNotifications = ({ prompt = false }) => {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const refresh = () => getNativeNotificationStatus().then((status) => {
      if (!active) return;
      setEnabled(status.subscribed);
      if (status.subscribed && prompt) setDismissed(true);
      if (!status.configured) setMessage('Phone notifications are not available yet. Please try again later.');
    }).catch(() => {
      if (active) setMessage('Unable to check notifications. Please try Enable.');
    }).finally(() => { if (active) setChecking(false); });
    refresh();
    const resume = () => { if (!document.hidden) refresh(); };
    window.addEventListener('native-push:status', refresh);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      window.removeEventListener('native-push:status', refresh);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [prompt]);

  const enable = async () => {
    setBusy(true);
    setMessage('');
    try {
      await enableNativeNotifications();
      setEnabled(true);
      setMessage('Notifications enabled. A test was sent to this phone.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to enable notifications.');
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      await disableNativeNotifications();
      setEnabled(false);
      setMessage('Phone notifications are disabled.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to disable notifications.');
    } finally {
      setBusy(false);
    }
  };

  if (prompt) {
    if (checking || dismissed) return null;
    return (
      <div className="parent-push-prompt-backdrop">
        <section className="parent-push-prompt" role="dialog" aria-modal="true" aria-label="Phone notifications">
          <h2>Phone Notifications</h2>
          <p role="status">{message || 'Allow club messages on this phone.'}</p>
          <div className="parent-push-prompt-actions">
            <button type="button" className="btn-secondary" onClick={() => setDismissed(true)}>{enabled ? 'Done' : 'Later'}</button>
            {!enabled && <button type="button" className="btn-primary" onClick={enable} disabled={busy}>{busy ? 'Enabling...' : 'Allow'}</button>}
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="parent-setting-panel">
      <button type="button" className={`parent-setting-choice ${enabled ? 'is-selected' : ''}`} onClick={enabled ? disable : enable} disabled={busy || checking}>
        <span>Phone notifications</span><strong>{busy ? 'Please wait...' : enabled ? 'Disable' : 'Enable'}</strong>
      </button>
      {enabled && <button type="button" className="parent-setting-choice" onClick={enable} disabled={busy}><span>Test notification</span><strong>Send</strong></button>}
      <p className="parent-setting-note" role="status">{message || (checking ? 'Checking...' : enabled ? 'Enabled on this device' : 'Disabled')}</p>
    </div>
  );
};

export default NativePhoneNotifications;
