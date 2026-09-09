import { useEffect, useRef, useState } from 'react';
import {
  fetchCurrentDevicePushStatus,
  registerAndTestPushSubscription
} from '../services/notifications.js';
import {
  isIos,
  isPushSupported,
  isStandalone,
  pushTestMessage,
  requestPhoneNotificationPermission,
  observeNotificationPermission
} from '../utils/pushNotifications.js';

const getIosHelp = () => (
  isStandalone()
    ? 'Open iPhone Settings > Notifications > Warriors, then turn on Allow Notifications. If Warriors is not listed, remove the Home Screen app, add it again from Safari, then tap Allow.'
    : 'Open this site in Safari, tap Share, Add to Home Screen, then open Warriors from the Home Screen icon and tap Allow.'
);

const getBlockedHelp = () => {
  if (isIos()) return getIosHelp();
  return 'Notifications are blocked by this device or browser. The app cannot change this permission.';
};

const ParentNotificationPermissionPrompt = ({ user }) => {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('');
  const enablingRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (user?.role !== 'parent') {
      setVisible(false);
      return undefined;
    }

    let isMounted = true;
    dismissedRef.current = false;
    setStatus('checking');
    setVisible(true);

    const checkStatus = async () => {
      if (enablingRef.current || dismissedRef.current) return;
      if (isMounted) setMessage('');
      if (isIos() && !isStandalone()) {
        if (isMounted) {
          setMessage(getIosHelp());
          setStatus('install-first');
          setVisible(true);
        }
        return;
      }

      if (!isPushSupported()) {
        if (isMounted) {
          setMessage(window.isSecureContext
            ? 'This browser does not support phone notifications.'
            : 'Open the app with HTTPS to enable phone notifications.');
          setStatus('unsupported');
          setVisible(true);
        }
        return;
      }

      if (Notification.permission === 'denied') {
        if (isMounted) {
          setMessage(getBlockedHelp());
          setStatus('blocked');
          setVisible(true);
        }
        return;
      }

      if (Notification.permission === 'default') {
        if (isMounted) {
          setStatus('ready');
          setVisible(true);
        }
        return;
      }

      const serverStatus = await fetchCurrentDevicePushStatus();
      if (!serverStatus.configured) {
        if (isMounted) {
          setMessage('Push is not configured on the server yet.');
          setStatus('unsupported');
          setVisible(true);
        }
        return;
      }

      if (isMounted && !dismissedRef.current && !enablingRef.current) {
        setVisible(!serverStatus.subscribed);
        setStatus(serverStatus.subscribed ? 'enabled' : 'ready');
      }
    };

    const refresh = () => {
      checkStatus().catch(() => {
        if (isMounted && !dismissedRef.current && !enablingRef.current) {
          setStatus('ready');
          setVisible(true);
        }
      });
    };
    refresh();
    const stopObserving = observeNotificationPermission(refresh);

    return () => {
      isMounted = false;
      stopObserving();
    };
  }, [user?.role, user?.id]);

  const dismiss = () => {
    dismissedRef.current = true;
    setVisible(false);
  };

  const enableNotifications = async () => {
    setMessage('');

    if (isIos() && !isStandalone()) {
      setMessage(getIosHelp());
      setStatus('install-first');
      return;
    }

    if (!isPushSupported()) {
      setMessage(window.isSecureContext ? 'This browser does not support phone notifications.' : 'Open the app with HTTPS to enable phone notifications.');
      setStatus('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setMessage(getBlockedHelp());
      setStatus('blocked');
      return;
    }

    setStatus('enabling');
    enablingRef.current = true;
    try {
      const permission = await requestPhoneNotificationPermission();
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? getBlockedHelp() : 'Tap Allow when the browser asks for notification permission.');
        setStatus(permission === 'denied' ? 'blocked' : 'ready');
        return;
      }

      const { delivery } = await registerAndTestPushSubscription();
      setStatus('enabled');
      setMessage(pushTestMessage(delivery));
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to enable phone notifications. Please try again.');
      setStatus('ready');
    } finally {
      enablingRef.current = false;
    }
  };

  if (!visible) return null;

  const isBlocked = status === 'blocked';
  const canEnable = status === 'ready';

  return (
    <div className="parent-push-prompt-backdrop" role="presentation">
      <section className="parent-push-prompt" role="dialog" aria-modal="true" aria-label="Enable phone notifications">
        <button type="button" className="parent-push-prompt-close" onClick={dismiss} aria-label="Close">x</button>
        <span className="parent-push-prompt-icon" aria-hidden="true">!</span>
        <h2>Enable Phone Notifications</h2>
        <p>{message || 'Allow notifications so club messages can reach this phone even when the app is closed.'}</p>
        {isBlocked && (
          <div className="parent-push-help">
            <strong>If it still says Blocked:</strong>
            <span>{getBlockedHelp()}</span>
          </div>
        )}
        <div className="parent-push-prompt-actions">
          <button type="button" className="btn-secondary" onClick={dismiss}>{status === 'enabled' ? 'Done' : 'Later'}</button>
          {status !== 'enabled' && (
            <button type="button" className="btn-primary" onClick={enableNotifications} disabled={!canEnable}>
              {status === 'checking' ? 'Checking...' : status === 'enabling' ? 'Enabling...' : 'Allow'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default ParentNotificationPermissionPrompt;
