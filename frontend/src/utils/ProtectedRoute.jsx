import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="spinner border-brand-500 border-t-brand-200 w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Role check
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user?.role)) {
      const defaultPaths = {
        super_admin: '/superadmin',
        teacher: '/teacher',
        student: '/student',
      };
      return <Navigate to={defaultPaths[user?.role] || '/login'} replace />;
    }
  }

  return children;
}
