import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  MinusCircleIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  SignalIcon,
  WifiIcon,
} from '@heroicons/react/24/solid';

const iconMap = {
  '✓': { Icon: CheckCircleIcon, lightColor: 'text-emerald-600', darkColor: 'dark:text-emerald-400' },
  '✕': { Icon: XCircleIcon, lightColor: 'text-red-600', darkColor: 'dark:text-red-400' },
  '⚠': { Icon: ExclamationTriangleIcon, lightColor: 'text-amber-600', darkColor: 'dark:text-amber-400' },
  '◐': { Icon: MinusCircleIcon, lightColor: 'text-amber-600', darkColor: 'dark:text-amber-400' },
  '👥': { Icon: UsersIcon, lightColor: 'text-blue-600', darkColor: 'dark:text-blue-400' },
  '📋': { Icon: ClipboardDocumentListIcon, lightColor: 'text-purple-600', darkColor: 'dark:text-purple-400' },
  '◎': { Icon: SignalIcon, lightColor: 'text-red-600', darkColor: 'dark:text-red-400' },
  '◉': { Icon: WifiIcon, lightColor: 'text-cyan-600', darkColor: 'dark:text-cyan-400' },
};

const accentBgMap = {
  green:  'bg-emerald-100 dark:bg-emerald-500/10',
  red:    'bg-red-100 dark:bg-red-500/10',
  amber:  'bg-amber-100 dark:bg-amber-500/10',
  blue:   'bg-blue-100 dark:bg-blue-500/10',
  purple: 'bg-purple-100 dark:bg-purple-500/10',
  orange: 'bg-orange-100 dark:bg-orange-500/10',
  cyan:   'bg-cyan-100 dark:bg-cyan-500/10',
};

export default function StatsCard({ icon, title, value, subtitle, color = 'blue', delay = 0 }) {
  const mapped = iconMap[icon];
  const accentBg = accentBgMap[color] || accentBgMap.blue;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className={`stat-card stat-card-${color}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider mb-1">
            {title}
          </p>
          <motion.p
            className="text-2xl font-black text-surface-900 dark:text-surface-100"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.2, type: 'spring', stiffness: 200 }}
          >
            {value}
          </motion.p>
          {subtitle && (
            <p className="text-[11px] text-surface-600 dark:text-surface-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-xl ${accentBg} flex items-center justify-center`}>
          {mapped ? (
            <mapped.Icon className={`w-5 h-5 ${mapped.lightColor} ${mapped.darkColor}`} />
          ) : (
            <span className="text-lg">{icon}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
