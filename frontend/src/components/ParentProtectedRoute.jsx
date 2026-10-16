import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ParentProtectedRoute = () => {
  const { user } = useAuth();

  if (!user || user.role !== 'parent') {
    return <Navigate to="/parent/login" replace />;
  }

  return <Outlet />;
};

export default ParentProtectedRoute;
