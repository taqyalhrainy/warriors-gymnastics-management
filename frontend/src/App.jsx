import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

const LoginPage = lazy(() => import('./pages/Login.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const PlayersPage = lazy(() => import('./pages/Players.jsx'));
const PlayerFormPage = lazy(() => import('./pages/PlayerForm.jsx'));
const PlayerProfilePage = lazy(() => import('./pages/PlayerProfile.jsx'));
const GroupsPage = lazy(() => import('./pages/Groups.jsx'));
const AttendancePage = lazy(() => import('./pages/Attendance.jsx'));
const PaymentsPage = lazy(() => import('./pages/Payments.jsx'));
const OwnerDashboardPage = lazy(() => import('./pages/OwnerDashboard.jsx'));
const NotificationsPage = lazy(() => import('./pages/Notifications.jsx'));
const ReportsPage = lazy(() => import('./pages/Reports.jsx'));
const HistoryPage = lazy(() => import('./pages/History.jsx'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogs.jsx'));
const ParentsPage = lazy(() => import('./pages/Parents.jsx'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard.jsx'));
const ParentAttendancePage = lazy(() => import('./pages/ParentAttendance.jsx'));
const ParentPaymentsPage = lazy(() => import('./pages/ParentPayments.jsx'));
const ParentNotificationsPage = lazy(() => import('./pages/ParentNotifications.jsx'));
const NotificationDetailPage = lazy(() => import('./pages/NotificationDetail.jsx'));
const adminRoles = ['admin', 'coach', 'receptionist'];
const parentRoles = ['parent'];

function App() {
  const { user } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="app-shell">
      <button className={`theme-toggle-btn ${language === 'ar' ? 'left' : 'right'}`} type="button" onClick={toggleTheme}>
        <span>{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
      </button>
      <button className={`language-toggle-btn ${language === 'ar' ? 'left' : 'right'}`} type="button" onClick={toggleLanguage}>
        <span>{language === 'en' ? 'AR' : 'EN'}</span>
      </button>
      <Suspense fallback={<div className="route-loading"><span className="loading-spinner" />Loading...</div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ProtectedRoute roles={adminRoles} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/players/new" element={<PlayerFormPage />} />
              <Route path="/players/:id/edit" element={<PlayerFormPage />} />
              <Route path="/players/:id" element={<PlayerProfilePage />} />
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/notifications/:id" element={<NotificationDetailPage />} />
              <Route path="/parents" element={<ParentsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/owner-summary" element={<OwnerDashboardPage />} />
            </Route>
            <Route element={<ProtectedRoute roles={parentRoles} />}>
              <Route path="/parent" element={<ParentDashboard />} />
              <Route path="/parent/attendance" element={<ParentAttendancePage />} />
              <Route path="/parent/payments" element={<ParentPaymentsPage />} />
              <Route path="/parent/notifications" element={<ParentNotificationsPage />} />
              <Route path="/parent/notifications/:id" element={<NotificationDetailPage />} />
            </Route>
          </Route>
          <Route path="/" element={user ? <Navigate to={user.role === 'parent' ? '/parent' : '/admin'} /> : <Navigate to="/login" />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
