import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import StatsCard from '../../components/common/StatsCard';
import { CameraIcon, ClipboardDocumentListIcon, ChartBarIcon, BellIcon, UserCircleIcon } from '@heroicons/react/24/outline';

const COLORS = ['#6ee7b7', '#fcd34d', '#fca5a5', '#6B7280'];
const chartTooltipStyle = { background: '#1F2630', border: '1px solid #2A3240', borderRadius: 12, color: '#F5F7FA', fontSize: 12 };

export default function StudentDashboard() {
  const { studentId } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    api.get(`/attendance/student/${studentId}`).then(res => setStats(res.data.stats))
      .catch(() => {}).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>;

  const pieData = stats ? [
    { name: 'Full', value: stats.full },
    { name: 'Partial', value: stats.partial },
    { name: 'Suspicious', value: stats.suspicious },
    { name: 'Absent', value: stats.absent },
  ].filter(d => d.value > 0) : [];

  const subjectData = stats?.subject_wise ? Object.entries(stats.subject_wise).map(([name, s]) => ({
    name: name.length > 12 ? name.slice(0, 12) + '…' : name,
    percentage: s.percentage,
    present: s.present,
    total: s.total,
  })) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-1">My Dashboard</h1>
        <p className="text-sm text-surface-500">ATTENDX — Student Portal</p>
      </div>

      {/* Percentage Hero */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-8 mb-8 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(141,150,165,0.03), transparent)' }} />
        <div className="relative z-10">
          <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-widest mb-2">Overall Attendance</p>
          <p className={`text-7xl font-black ${(stats?.percentage || 0) >= 75 ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
            {stats?.percentage || 0}%
          </p>
          <p className="text-surface-500 mt-2 text-sm">
            {stats?.present || 0} of {stats?.total_classes || 0} classes attended
          </p>
          {(stats?.percentage || 0) < 75 && (
            <div className="mt-4 inline-block bg-red-500/10 text-red-400/80 px-4 py-2 rounded-xl text-xs font-semibold border border-red-500/10">
              Below 75% minimum threshold
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatsCard icon="✓" title="Full" value={stats?.full || 0} color="green" delay={0} />
        <StatsCard icon="◐" title="Partial" value={stats?.partial || 0} color="amber" delay={0.1} />
        <StatsCard icon="⚠" title="Suspicious" value={stats?.suspicious || 0} color="red" delay={0.2} />
        <StatsCard icon="✕" title="Absent" value={stats?.absent || 0} color="orange" delay={0.3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Pie Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
          <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200 mb-4">Attendance Breakdown</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center py-12 text-surface-500 text-sm">No attendance data yet</p>}
        </motion.div>

        {/* Subject Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
          <h3 className="text-sm font-bold text-surface-700 dark:text-surface-200 mb-4">Subject-wise Attendance</h3>
          {subjectData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={subjectData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A3240" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#2A3240' }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={{ stroke: '#2A3240' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {subjectData.map((entry, i) => (
                    <Cell key={i} fill={entry.percentage >= 75 ? '#6ee7b7' : '#fca5a5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center py-12 text-surface-500 text-sm">No subject data yet</p>}
        </motion.div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { to: '/student/mark', icon: CameraIcon, label: 'Mark Attendance' },
          { to: '/student/history', icon: ClipboardDocumentListIcon, label: 'History' },
          { to: '/student/analytics', icon: ChartBarIcon, label: 'Analytics' },
          { to: '/student/notifications', icon: BellIcon, label: 'Notifications' },
          { to: '/student/profile', icon: UserCircleIcon, label: 'My Profile' },
        ].map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }}>
            <Link to={a.to} className="glass-card p-5 block group hover:-translate-y-1 text-center">
              <div className="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 order border-border/40 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <a.icon className="w-5 h-5 text-surface-400" />
              </div>
              <p className="text-xs font-semibold text-surface-700 dark:text-surface-300">{a.label}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
