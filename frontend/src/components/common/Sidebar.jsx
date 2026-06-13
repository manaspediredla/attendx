import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AttendXLogo, { AttendXLogoText } from './AttendXLogo';
import {
  HomeIcon, UserGroupIcon, AcademicCapIcon, ClipboardDocumentListIcon,
  ChartBarIcon, BellIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon,
  MapPinIcon, WifiIcon, ShieldCheckIcon,
  CameraIcon, CloudArrowUpIcon, UserPlusIcon, ClockIcon,
  UserCircleIcon, KeyIcon,
} from '@heroicons/react/24/outline';

const superAdminLinks = [
  { to: '/superadmin', icon: HomeIcon, label: 'Command Center' },
  { to: '/superadmin/teachers', icon: UserPlusIcon, label: 'Teachers' },
  { to: '/superadmin/students', icon: AcademicCapIcon, label: 'Students' },
  { to: '/superadmin/locations', icon: MapPinIcon, label: 'GPS Locations' },
  { to: '/superadmin/networks', icon: WifiIcon, label: 'Networks' },
  { to: '/superadmin/settings', icon: Cog6ToothIcon, label: 'Settings' },
  { to: '/superadmin/audit-logs', icon: ShieldCheckIcon, label: 'Audit Logs' },
];

const teacherLinks = [
  { to: '/teacher', icon: HomeIcon, label: 'Dashboard' },
  { to: '/teacher/attendance', icon: ClockIcon, label: 'Attendance' },
  { to: '/teacher/students', icon: UserGroupIcon, label: 'Students' },
  { to: '/teacher/reports', icon: ChartBarIcon, label: 'Reports' },
  { to: '/teacher/analytics', icon: ClipboardDocumentListIcon, label: 'Analytics' },
];

const studentLinks = [
  { to: '/student', icon: HomeIcon, label: 'Dashboard' },
  { to: '/student/mark', icon: CameraIcon, label: 'Mark Attendance' },
  { to: '/student/history', icon: ClipboardDocumentListIcon, label: 'History' },
  { to: '/student/analytics', icon: ChartBarIcon, label: 'Analytics' },
  { to: '/student/notifications', icon: BellIcon, label: 'Notifications' },
  { to: '/student/profile', icon: UserCircleIcon, label: 'My Profile' },
];

export default function Sidebar({ isOpen, onToggle }) {
  const { user, logout } = useAuth();

  const links = user?.role === 'super_admin' ? superAdminLinks
    : user?.role === 'teacher' ? teacherLinks
      : studentLinks;

  const roleLabel = user?.role === 'super_admin' ? 'Super Admin'
    : user?.role === 'teacher' ? 'Teacher'
      : 'Student';

  /* Sidebar is ALWAYS dark (charcoal) in both light and dark modes */
  return (
    <aside className={`fixed top-0 left-0 h-screen glass-sidebar flex flex-col transition-all duration-300 z-50 ${isOpen ? 'w-64' : 'w-[72px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* AttendX Logo */}
          <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
            <AttendXLogo size={36} />
          </div>
          {isOpen && <AttendXLogoText variant="light" />}
        </div>
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg bg-[#252B35] hover:bg-[#2A3240] flex items-center justify-center text-surface-500 hover:text-surface-300 transition-colors shrink-0 border border-[#333B48]/30"
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/superadmin' || to === '/teacher' || to === '/student'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative
              ${isActive
                ? 'bg-[#252B35] text-white border border-[#333B48]/40'
                : 'text-surface-400 hover:bg-[#1C222B] hover:text-surface-200 border border-transparent'
              }
            `}
          >
            {({ isActive }) => (
              <>
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-surface-400" />}
                <Icon className="w-5 h-5 shrink-0" />
                {isOpen && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-white/[0.06]">
        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#333B48] to-[#252B35] flex items-center justify-center text-surface-300 font-bold text-sm shrink-0 border border-[#333B48]">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          {isOpen && (
            <div className="overflow-hidden">
              <span className="block text-sm font-semibold text-surface-200 truncate">{user?.name}</span>
              <span className="block text-xs text-surface-500 capitalize">{roleLabel}</span>
            </div>
          )}
        </div>

        {/* Change Password */}
        <NavLink
          to="/change-password"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-surface-400 hover:bg-[#1C222B] hover:text-surface-200 transition-colors border border-transparent"
        >
          <KeyIcon className="w-5 h-5 shrink-0" />
          {isOpen && <span>Change Password</span>}
        </NavLink>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400/70 hover:bg-red-500/5 hover:text-red-400 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5 shrink-0" />
          {isOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
