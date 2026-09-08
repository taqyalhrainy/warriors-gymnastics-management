import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ProtectedRoute = ({ roles }) => {
  const { user } = useAuth();
  const adminPaths = ['/admin', '/players', '/groups', '/attendance', '/coaches', '/payments', '/notifications', '/parents', '/reports', '/history', '/security', '/audit-logs', '/owner-summary', '/media-gallery'];
  const isAdminPath = adminPaths.some((path) => window.location.pathname === path || window.location.pathname.startsWith(`${path}/`));
  const isParentPath = window.location.pathname === '/parent' || window.location.pathname.startsWith('/parent/');

  if (!user) {
    return <Navigate to={isAdminPath ? '/admin/login' : (isParentPath ? '/parent/login' : '/login')} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    if (isParentPath) {
      return <Navigate to="/parent/login" replace />;
    }
    if (isAdminPath) {
      return <Navigate to="/admin/login" replace />;
    }
    return <Navigate to={user.role === 'parent' ? '/parent' : '/admin'} replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
