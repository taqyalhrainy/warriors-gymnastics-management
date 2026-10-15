import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ParentProtectedRoute from './components/ParentProtectedRoute.jsx';
import ParentMessageNotifier from './components/ParentMessageNotifier.jsx';
import ParentNotificationPermissionPrompt from './components/ParentNotificationPermissionPrompt.jsx';
import NativeAppLifecycle from './components/NativeAppLifecycle.jsx';
import warriorsLogo from './assets/warriors-logo.png';
import { isNativeAndroidApp, setupNativePushListeners } from './utils/nativePushNotifications.js';

const ParentLoginPage = lazy(() => import('./pages/ParentLogin.jsx'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard.jsx'));
const ParentAttendancePage = lazy(() => import('./pages/ParentAttendance.jsx'));
const ParentPaymentsPage = lazy(() => import('./pages/ParentPayments.jsx'));
const ParentNotificationsPage = lazy(() => import('./pages/ParentNotifications.jsx'));
const ParentSettingsPage = lazy(() => import('./pages/ParentSettings.jsx'));
const ParentChildrenPage = lazy(() => import('./pages/ParentChildren.jsx'));
const ParentSubscriptionSummaryPage = lazy(() => import('./pages/ParentSubscriptionSummary.jsx'));
const ParentNotificationDetailPage = lazy(() => import('./pages/ParentNotificationDetail.jsx'));

function ParentApp() {
  const { user } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (isNativeAndroidApp()) setupNativePushListeners().catch(console.error);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const originalViewport = viewport?.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    const isParentApp = user?.role === 'parent';

    if (viewport) {
      viewport.setAttribute(
        'content',
        isParentApp
          ? 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
          : originalViewport
      );
    }

    if (!isParentApp) return undefined;

    const preventZoomKeys = (event) => {
      if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
    };
    const preventCtrlWheelZoom = (event) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const preventPinchZoom = (event) => {
      if (event.touches?.length > 1) event.preventDefault();
    };
    const preventGestureZoom = (event) => event.preventDefault();

    window.addEventListener('keydown', preventZoomKeys);
    window.addEventListener('wheel', preventCtrlWheelZoom, { passive: false });
    document.addEventListener('touchmove', preventPinchZoom, { passive: false });
    document.addEventListener('gesturestart', preventGestureZoom);
    document.addEventListener('gesturechange', preventGestureZoom);

    return () => {
      if (viewport) viewport.setAttribute('content', originalViewport);
      window.removeEventListener('keydown', preventZoomKeys);
      window.removeEventListener('wheel', preventCtrlWheelZoom);
      document.removeEventListener('touchmove', preventPinchZoom);
      document.removeEventListener('gesturestart', preventGestureZoom);
      document.removeEventListener('gesturechange', preventGestureZoom);
    };
  }, [user?.role]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const homePath = user?.role === 'parent' ? '/parent' : '/parent/login';

  return (
    <div className={`app-shell${user?.role === 'parent' ? ' parent-app-shell' : ''}`}>
      <ParentMessageNotifier />
      <ParentNotificationPermissionPrompt user={user} />
      <Suspense fallback={<div className="route-loading"><img src={warriorsLogo} alt="" /><span className="loading-spinner" />Loading...</div>}>
        <NativeAppLifecycle />
        <Routes>
          <Route path="/login" element={<ParentLoginPage />} />
          <Route path="/parent/login" element={<ParentLoginPage />} />
          <Route element={<ParentProtectedRoute />}>
            <Route path="/parent" element={<ParentDashboard />} />
            <Route path="/parent/attendance" element={<ParentAttendancePage />} />
            <Route path="/parent/payments" element={<ParentPaymentsPage />} />
            <Route path="/parent/notifications" element={<ParentNotificationsPage />} />
            <Route path="/parent/settings" element={<ParentSettingsPage theme={theme} toggleTheme={toggleTheme} />} />
            <Route path="/parent/children" element={<ParentChildrenPage />} />
            <Route path="/parent/subscriptions" element={<ParentSubscriptionSummaryPage />} />
            <Route path="/parent/notifications/:id" element={<ParentNotificationDetailPage />} />
          </Route>
          <Route path="/" element={<Navigate to={homePath} replace />} />
          <Route path="*" element={<Navigate to={homePath} replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default ParentApp;
