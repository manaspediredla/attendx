import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import AttendXLogo from '../components/common/AttendXLogo';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  const goHome = () => {
    if (isAuthenticated) {
      const paths = { super_admin: '/superadmin', teacher: '/teacher', student: '/student' };
      navigate(paths[user?.role] || '/login', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0E1117' }}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-md"
      >
        <div className="mb-8">
          <AttendXLogo className="w-16 h-16 mx-auto mb-4" />
        </div>

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-8xl font-black bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent mb-4">
            404
          </h1>
        </motion.div>

        <h2 className="text-2xl font-bold text-white/90 mb-3">Page Not Found</h2>
        <p className="text-white/50 mb-8 text-sm leading-relaxed">
          The page you're looking for doesn't exist or you don't have permission to access it.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={goHome}
            className="px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40"
          >
            {isAuthenticated ? '🏠 Go to Dashboard' : '🔐 Go to Login'}
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white/70 font-semibold rounded-xl border border-white/10 transition-all duration-200"
          >
            ← Go Back
          </button>
        </div>
      </motion.div>
    </div>
  );
}
