import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import StatsCard from '../../components/common/StatsCard';
import { ClockIcon, ChartBarIcon, UserGroupIcon, SparklesIcon } from '@heroicons/react/24/outline';

export default function TeacherDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/dashboard').then(res => setStats(res.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>;

  const quickActions = [
    { to: '/teacher/attendance', icon: ClockIcon, label: 'Create Session', desc: 'Schedule attendance' },
    { to: '/teacher/students', icon: UserGroupIcon, label: 'View Students', desc: 'Student roster' },
    { to: '/teacher/reports', icon: ChartBarIcon, label: 'View Reports', desc: 'Analytics & export' },
    { to: '/teacher/analytics', icon: SparklesIcon, label: 'Predictions', desc: 'AI risk forecasting' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-1">Dashboard</h1>
        <p className="text-sm text-surface-500">Welcome to ATTENDX — Faculty Portal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon="👥" title="Total Students" value={stats?.total_students || 0} color="blue" delay={0} />
        <StatsCard icon="✓" title="Full Today" value={stats?.full_today || 0} color="green" delay={0.1} />
        <StatsCard icon="◐" title="Partial Today" value={stats?.partial_today || 0} color="amber" delay={0.2} />
        <StatsCard icon="⚠" title="Below 75%" value={stats?.below_75_count || 0} color="red" delay={0.3} />
      </div>

      <h2 className="text-sm font-bold text-surface-600 dark:text-surface-400 uppercase tracking-wider mb-4">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
            <Link to={a.to} className="glass-card p-6 block group hover:-translate-y-1">
              <div className="w-11 h-11 rounded-xl bg-surface-100 dark:bg-surface-800 order border-border/40 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 text-surface-400" />
              </div>
              <h3 className="font-bold text-surface-900 dark:text-surface-100 text-sm">{a.label}</h3>
              <p className="text-xs text-surface-500 mt-1">{a.desc}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
