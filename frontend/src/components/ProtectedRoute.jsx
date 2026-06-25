import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ProtectedRoute = ({ roles }) => {
  const { user, isServerReady, isServerChecking } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!isServerReady) {
    return (
      <div className="route-loading server-wake-loading" role="status" aria-live="polite">
        <span className="loading-spinner" />
        <strong>{isServerChecking ? 'Preparing the system...' : 'Still preparing the system...'}</strong>
        <p>Please wait a moment.</p>
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'parent' ? '/parent' : '/admin'} replace />;
  }
  return <Outlet />;
};

export default ProtectedRoute;
