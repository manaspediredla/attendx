import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../../api/axios';
import StatsCard from '../../components/common/StatsCard';

const chartTooltipStyle = { background: '#1F2630', border: '1px solid #2A3240', borderRadius: 12, color: '#F5F7FA', fontSize: 12 };

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/analytics').then(res => {
      setStats(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-1">Command Center</h1>
        <p className="text-sm text-surface-500">Welcome to ATTENDX — Institution Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon="👥" title="Total Students" value={stats?.total_students || 0} color="blue" delay={0} />
        <StatsCard icon="📋" title="Total Teachers" value={stats?.total_teachers || 0} color="purple" delay={0.1} />
        <StatsCard icon="✓" title="Full Attendance" value={stats?.full_today || 0} subtitle="Today" color="green" delay={0.2} />
        <StatsCard icon="◐" title="Partial" value={stats?.partial_today || 0} subtitle="Today" color="amber" delay={0.3} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard icon="⚠" title="Suspicious" value={stats?.suspicious_today || 0} subtitle="Today" color="red" delay={0.4} />
        <StatsCard icon="✕" title="Absent" value={stats?.absent_today || 0} subtitle="Today" color="orange" delay={0.5} />
        <StatsCard icon="◎" title="GPS Failures" value={stats?.gps_failures || 0} subtitle="Today" color="red" delay={0.6} />
        <StatsCard icon="◉" title="Network Failures" value={stats?.network_failures || 0} subtitle="Today" color="cyan" delay={0.7} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
          <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200 mb-4">Monthly Attendance Trend</h3>
          {stats?.monthly_trends?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.monthly_trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" opacity={0.5} />
                <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#2A3240' }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#2A3240' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="rate" fill="url(#greyGrad)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="greyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8D96A5" />
                    <stop offset="100%" stopColor="#4B5563" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-surface-500 text-center py-8 text-sm">No data yet</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200">Students Below 75%</h3>
            <span className="badge badge-absent">{stats?.below_75_count || 0}</span>
          </div>
          <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
            {stats?.below_75?.length > 0 ? stats.below_75.slice(0, 10).map((s, i) => (
              <div key={s.student_id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-900/50 border border-border/30">
                <span className="w-6 h-6 rounded-lg bg-surface-800 flex items-center justify-center text-[10px] font-bold text-surface-400 border border-border/30">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-700 dark:text-surface-200 truncate">{s.full_name || s.name}</p>
                  <p className="text-[11px] text-surface-500">{s.id} · {s.department} · {s.college_name || '—'}</p>
                </div>
                <span className="text-lg font-extrabold text-red-400/80">{s.percentage}%</span>
              </div>
            )) : <p className="text-surface-500 text-center py-8 text-sm">All students above 75%</p>}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200 mb-4">College-wise Attendance</h3>
          {stats?.college_wise?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.college_wise}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" opacity={0.5} />
                <XAxis dataKey="college" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={{ stroke: '#2A3240' }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} domain={[0, 100]} axisLine={{ stroke: '#2A3240' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="percentage" fill="#6B7280" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-surface-500 text-center py-8 text-sm">No college data yet</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="glass-card p-6">
          <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200 mb-4">City-wise Attendance</h3>
          {stats?.city_wise?.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.city_wise}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" opacity={0.5} />
                <XAxis dataKey="city" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={{ stroke: '#2A3240' }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} domain={[0, 100]} axisLine={{ stroke: '#2A3240' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="percentage" fill="#4B5563" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-surface-500 text-center py-8 text-sm">No city data yet</p>}
        </motion.div>
      </div>
    </motion.div>
  );
}
