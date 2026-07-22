import { useEffect, useRef, useState } from 'react';
import { apiHealthURL } from '../services/api.js';

const PING_INTERVAL_MS = 8000;
const PING_TIMEOUT_MS = 15000;
const FAILURE_THRESHOLD = 3;
const RECOVERY_SUCCESSES = 1;

const getInitialOnlineState = () => (
  typeof navigator === 'undefined' ? true : navigator.onLine
);

const NetworkGuard = () => {
  const [isBlocked, setIsBlocked] = useState(() => !getInitialOnlineState());
  const [message, setMessage] = useState(() => (
    getInitialOnlineState()
      ? 'Checking connection...'
      : 'Internet connection is offline.'
  ));
  const isBlockedRef = useRef(!getInitialOnlineState());
  const successCountRef = useRef(0);
  const failureCountRef = useRef(getInitialOnlineState() ? 0 : 1);

  useEffect(() => {
    let isMounted = true;
    let timeoutId = null;
    let controller = null;

    const blockConnection = (nextMessage) => {
      if (!isMounted) return;
      successCountRef.current = 0;
      isBlockedRef.current = true;
      window.__warriorsNetworkBlocked = true;
      setMessage(nextMessage);
      setIsBlocked(true);
    };

    const registerFailure = (nextMessage, options = {}) => {
      failureCountRef.current += 1;
      if (options.force || failureCountRef.current >= FAILURE_THRESHOLD) {
        blockConnection(nextMessage);
      }
    };

    const releaseConnection = () => {
      if (!isMounted) return;
      failureCountRef.current = 0;
      isBlockedRef.current = false;
      window.__warriorsNetworkBlocked = false;
      setIsBlocked(false);
      setMessage('');
    };

    const runPing = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        registerFailure('Internet connection is offline.', { force: true });
        scheduleNextPing();
        return;
      }

      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
      const startedAt = performance.now();

      try {
        const response = await fetch(apiHealthURL, {
          cache: 'no-store',
          credentials: 'omit',
          mode: 'cors',
          signal: controller.signal
        });
        const latency = performance.now() - startedAt;
        clearTimeout(timeout);

        if (!response.ok || latency > PING_TIMEOUT_MS) {
          registerFailure(latency > PING_TIMEOUT_MS ? 'Connection is too weak to save safely.' : 'Server connection is unstable.');
        } else {
          successCountRef.current += 1;
          if (successCountRef.current >= RECOVERY_SUCCESSES) {
            releaseConnection();
          }
        }
      } catch (error) {
        clearTimeout(timeout);
        registerFailure(error.name === 'AbortError' ? 'Connection is too weak to save safely.' : 'Connection to the server was lost.');
      } finally {
        scheduleNextPing();
      }
    };

    const scheduleNextPing = () => {
      if (!isMounted) return;
      timeoutId = setTimeout(runPing, PING_INTERVAL_MS);
    };

    const handleBrowserOffline = () => {
      registerFailure('Internet connection is offline.', { force: true });
    };

    const handleBrowserOnline = () => {
      runPing();
    };

    const handleApiNetworkStatus = (event) => {
      if (event.detail?.status === 'offline') {
        registerFailure(event.detail?.reason === 'timeout'
          ? 'Connection is too weak to save safely.'
          : 'Connection to the server was lost.');
      }

      if (event.detail?.status === 'online' && isBlockedRef.current) {
        successCountRef.current += 1;
        if (successCountRef.current >= RECOVERY_SUCCESSES) {
          releaseConnection();
        }
      }
    };

    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('network:status', handleApiNetworkStatus);
    runPing();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (controller) controller.abort();
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('network:status', handleApiNetworkStatus);
    };
  }, []);

  if (!isBlocked) {
    return null;
  }

  return (
    <div className="network-guard-overlay" role="alert" aria-live="assertive">
      <div className="network-guard-panel">
        <div className="network-wifi-icon" aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
        </div>
        <strong>Connection paused</strong>
        <p>{message || 'Waiting for a stable connection.'}</p>
      </div>
    </div>
  );
};

export default NetworkGuard;
