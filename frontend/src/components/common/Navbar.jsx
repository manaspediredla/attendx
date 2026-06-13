import { useAuth } from '../../context/AuthContext';
import { Bars3Icon, SunIcon, MoonIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { AttendXLogoText } from './AttendXLogo';

export default function Navbar({ onToggleSidebar, darkMode, onToggleDarkMode }) {
  const { user } = useAuth();

  const roleLabel = user?.role === 'super_admin' ? 'Super Admin'
    : user?.role === 'teacher' ? 'Teacher'
    : 'Student';

  return (
    <nav className="fixed top-0 right-0 left-64 h-16 backdrop-blur-xl border-b flex items-center justify-between px-6 z-40 transition-all duration-300 bg-white/80 border-[#E5E7EB] dark:bg-[#161B22]/80 dark:border-[#333B48]/40">
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="btn-icon lg:hidden">
          <Bars3Icon className="w-5 h-5" />
        </button>
        <AttendXLogoText />
      </div>

      <div className="flex items-center gap-3">
        {/* Dark/Light Toggle */}
        <button
          onClick={onToggleDarkMode}
          className="btn-icon w-9 h-9"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode ? <SunIcon className="w-5 h-5 text-amber-400" /> : <MoonIcon className="w-5 h-5" />}
        </button>

        {/* Settings icon */}
        <button className="btn-icon w-9 h-9" title="Settings">
          <Cog6ToothIcon className="w-5 h-5" />
        </button>

        {/* User Badge */}
        <div className="hidden sm:flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-surface-400 to-surface-500 dark:from-[#333B48] dark:to-[#252B35] flex items-center justify-center text-white dark:text-surface-300 font-bold text-sm border border-surface-300 dark:border-[#333B48]">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <span className="block text-sm font-semibold text-surface-800 dark:text-surface-200">
              {user?.name}
            </span>
            <span className="block text-xs text-surface-500 capitalize">{roleLabel}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
