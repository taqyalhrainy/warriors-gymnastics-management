import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useLanguage } from './context/LanguageContext.jsx';
import LoginPage from './pages/Login.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import PlayersPage from './pages/Players.jsx';
import PlayerFormPage from './pages/PlayerForm.jsx';
import PlayerProfilePage from './pages/PlayerProfile.jsx';
import GroupsPage from './pages/Groups.jsx';
import AttendancePage from './pages/Attendance.jsx';
import SubscriptionsPage from './pages/Subscriptions.jsx';
import PaymentsPage from './pages/Payments.jsx';
import NotificationsPage from './pages/Notifications.jsx';
import ReportsPage from './pages/Reports.jsx';
import AuditLogsPage from './pages/AuditLogs.jsx';
import ParentsPage from './pages/Parents.jsx';
import ProgramsPage from './pages/Programs.jsx';
import CoachesPage from './pages/Coaches.jsx';
import ParentDashboard from './pages/ParentDashboard.jsx';
import ParentAttendancePage from './pages/ParentAttendance.jsx';
import ParentPaymentsPage from './pages/ParentPayments.jsx';
import ParentNotificationsPage from './pages/ParentNotifications.jsx';
import NotificationDetailPage from './pages/NotificationDetail.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

function App() {
  const { user } = useAuth();
  const { language, toggleLanguage } = useLanguage();

  return (
    <div className="app-shell">
      <button className={`language-toggle-btn ${language === 'ar' ? 'left' : 'right'}`} type="button" onClick={toggleLanguage}>
        <span>{language === 'en' ? 'عربي' : 'English'}</span>
      </button>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}> 
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/new" element={<PlayerFormPage />} />
          <Route path="/players/:id" element={<PlayerProfilePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/notifications/:id" element={<NotificationDetailPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/coaches" element={<CoachesPage />} />
          <Route path="/parents" element={<ParentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/parent" element={<ParentDashboard />} />
          <Route path="/parent/attendance" element={<ParentAttendancePage />} />
          <Route path="/parent/payments" element={<ParentPaymentsPage />} />
          <Route path="/parent/notifications" element={<ParentNotificationsPage />} />
          <Route path="/parent/notifications/:id" element={<NotificationDetailPage />} />
        </Route>
        <Route path="/" element={user ? <Navigate to={user.role === 'parent' ? '/parent' : '/admin'} /> : <Navigate to="/login" />} />
      </Routes>
    </div>
  );
}

export default App;
