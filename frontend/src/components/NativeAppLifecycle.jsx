import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isNativeAndroidApp, NATIVE_TAP_KEY, safeNotificationUrl } from '../utils/nativePushNotifications.js';
import { markAndroidAppReady } from '../services/androidLiveUpdate.js';

// Mounted inside Suspense: a broken initial route must not acknowledge an OTA bundle.
export default function NativeAppLifecycle() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname !== '/' && (user || pathname === '/parent/login')) markAndroidAppReady();
  }, [pathname, user?.id]);
  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    const openNotification = () => {
      let target;
      try { target = JSON.parse(sessionStorage.getItem(NATIVE_TAP_KEY)); } catch { /* Ignore malformed local state. */ }
      if (!target || !user) return;
      sessionStorage.removeItem(NATIVE_TAP_KEY);
      if (user.role === 'parent' && (!target.userId || target.userId === user.id)) {
        navigate(safeNotificationUrl(target.url));
      }
    };
    openNotification();
    window.addEventListener('native-push:tap', openNotification);
    return () => window.removeEventListener('native-push:tap', openNotification);
  }, [user?.id, navigate]);
  return null;
}
