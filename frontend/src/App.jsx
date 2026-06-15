import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './utils/ProtectedRoute';
import Sidebar from './components/common/Sidebar';
import Navbar from './components/common/Navbar';
import AttendXLogo from './components/common/AttendXLogo';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import ChangePasswordPage from './pages/auth/ChangePasswordPage';

// Custom 404
import NotFoundPage from './pages/NotFoundPage';

// Super Admin pages
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import TeacherManagement from './pages/superadmin/TeacherManagement';
import LocationManagement from './pages/superadmin/LocationManagement';
import NetworkManagement from './pages/superadmin/NetworkManagement';
import SystemSettings from './pages/superadmin/SystemSettings';
import AuditLogs from './pages/superadmin/AuditLogs';

// Teacher pages
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import TeacherAttendanceSession from './pages/teacher/TeacherAttendanceSession';
import StudentManagement from './pages/superadmin/StudentManagement';
import TeacherReports from './pages/teacher/TeacherReports';
import TeacherStudentList from './pages/teacher/TeacherStudentList';
import TeacherProfile from './pages/teacher/TeacherProfile';
import PredictiveAnalytics from './pages/teacher/PredictiveAnalytics';

// Student pages
import StudentDashboard from './pages/student/StudentDashboard';
import StudentAttendance from './pages/student/StudentAttendance';
import AttendanceHistory from './pages/student/AttendanceHistory';
import AttendanceAnalytics from './pages/student/AttendanceAnalytics';
import StudentNotifications from './pages/student/StudentNotifications';
import StudentProfile from './pages/student/StudentProfile';

// Determine basename: /attendx/ for production (GitHub Pages), / for dev
const BASE = import.meta.env.PROD ? '/attendx' : '';

/** Full-screen loading spinner shown while auth initializes */
function AppLoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0E1117' }}>
      <AttendXLogo className="w-16 h-16 animate-pulse" />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-white/40 text-sm font-medium">Loading AttendX...</p>
    </div>
  );
}

function AppLayout() {
  const { isAuthenticated, user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('attendx-theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('attendx-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  // Show branded loading screen while auth state initializes
  if (loading) {
    return <AppLoadingScreen />;
  }

  // ── Not authenticated: show login + catch-all redirect ──
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Any unknown or protected route → login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // ── Authenticated: full app shell ──
  const getDefaultPath = () => {
    switch (user?.role) {
      case 'super_admin': return '/superadmin';
      case 'teacher': return '/teacher';
      case 'student': return '/student';
      default: return '/login';
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8F9FB] dark:bg-[#0E1117] transition-colors duration-300">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-[72px]'}`}>
        <Navbar
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
        />
        <main className="p-6 mt-16 min-h-[calc(100vh-4rem)]">
          <Routes>
            {/* Authenticated user visiting /login → redirect to dashboard */}
            <Route path="/login" element={<Navigate to={getDefaultPath()} replace />} />

            {/* Root → dashboard */}
            <Route path="/" element={<Navigate to={getDefaultPath()} replace />} />

            {/* Super Admin Routes */}
            <Route path="/superadmin" element={
              <ProtectedRoute requiredRole="super_admin"><SuperAdminDashboard /></ProtectedRoute>
            } />
            <Route path="/superadmin/teachers" element={
              <ProtectedRoute requiredRole="super_admin"><TeacherManagement /></ProtectedRoute>
            } />
            <Route path="/superadmin/students" element={
              <ProtectedRoute requiredRole="super_admin"><StudentManagement /></ProtectedRoute>
            } />
            <Route path="/superadmin/locations" element={
              <ProtectedRoute requiredRole="super_admin"><LocationManagement /></ProtectedRoute>
            } />
            <Route path="/superadmin/networks" element={
              <ProtectedRoute requiredRole="super_admin"><NetworkManagement /></ProtectedRoute>
            } />
            <Route path="/superadmin/settings" element={
              <ProtectedRoute requiredRole="super_admin"><SystemSettings /></ProtectedRoute>
            } />
            <Route path="/superadmin/audit-logs" element={
              <ProtectedRoute requiredRole="super_admin"><AuditLogs /></ProtectedRoute>
            } />

            {/* Teacher Routes */}
            <Route path="/teacher" element={
              <ProtectedRoute requiredRole="teacher"><TeacherDashboard /></ProtectedRoute>
            } />
            <Route path="/teacher/attendance" element={
              <ProtectedRoute requiredRole="teacher"><TeacherAttendanceSession /></ProtectedRoute>
            } />
            <Route path="/teacher/reports" element={
              <ProtectedRoute requiredRole="teacher"><TeacherReports /></ProtectedRoute>
            } />
            <Route path="/teacher/students" element={
              <ProtectedRoute requiredRole="teacher"><TeacherStudentList /></ProtectedRoute>
            } />
            <Route path="/teacher/profile" element={
              <ProtectedRoute requiredRole="teacher"><TeacherProfile /></ProtectedRoute>
            } />
            <Route path="/teacher/analytics" element={
              <ProtectedRoute requiredRole="teacher"><PredictiveAnalytics /></ProtectedRoute>
            } />

            {/* Student Routes */}
            <Route path="/student" element={
              <ProtectedRoute requiredRole="student"><StudentDashboard /></ProtectedRoute>
            } />
            <Route path="/student/mark" element={
              <ProtectedRoute requiredRole="student"><StudentAttendance /></ProtectedRoute>
            } />
            <Route path="/student/history" element={
              <ProtectedRoute requiredRole="student"><AttendanceHistory /></ProtectedRoute>
            } />
            <Route path="/student/analytics" element={
              <ProtectedRoute requiredRole="student"><AttendanceAnalytics /></ProtectedRoute>
            } />
            <Route path="/student/notifications" element={
              <ProtectedRoute requiredRole="student"><StudentNotifications /></ProtectedRoute>
            } />
            <Route path="/student/profile" element={
              <ProtectedRoute requiredRole="student"><StudentProfile /></ProtectedRoute>
            } />

            {/* Shared */}
            <Route path="/change-password" element={
              <ProtectedRoute><ChangePasswordPage /></ProtectedRoute>
            } />

            {/* Custom 404 — catch all unknown routes */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={BASE}>
      <AuthProvider>
        <AppLayout />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: 'attendx-toast',
            style: {
              borderRadius: '12px',
              fontSize: '14px',
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
