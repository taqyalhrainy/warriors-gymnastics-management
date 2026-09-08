import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ProtectedRoute = ({ roles }) => {
  const { user } = useAuth();
  if (!user) {
    const adminPaths = ['/admin', '/players', '/groups', '/attendance', '/coaches', '/payments', '/notifications', '/parents', '/reports', '/history', '/security', '/audit-logs', '/owner-summary', '/media-gallery'];
    const isAdminPath = adminPaths.some((path) => window.location.pathname === path || window.location.pathname.startsWith(`${path}/`));
    return <Navigate to={isAdminPath ? '/admin-login' : '/login'} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'parent' ? '/parent' : '/admin'} replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
