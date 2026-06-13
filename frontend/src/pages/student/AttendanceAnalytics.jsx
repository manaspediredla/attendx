import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import StatsCard from '../../components/common/StatsCard';

const STATUS_COLORS = {
  Full: '#10b981',
  Partial: '#f59e0b',
  Suspicious: '#f97316',
  Absent: '#ef4444',
};

export default function AttendanceAnalytics() {
  const { studentId } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    api.get(`/attendance/student/${studentId}`).then(res => setStats(res.data.stats))
      .catch(() => {}).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  const subjectData = stats?.subject_wise ? Object.entries(stats.subject_wise).map(([name, s]) => ({
    name,
    percentage: s.percentage,
    present: s.present,
    total: s.total,
    absent: s.absent,
  })) : [];

  const pieData = stats ? [
    { name: 'Full', value: stats.full },
    { name: 'Partial', value: stats.partial },
    { name: 'Suspicious', value: stats.suspicious },
    { name: 'Absent', value: stats.absent },
  ].filter(d => d.value > 0) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📊 Attendance Analytics</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatsCard icon="📚" title="Total Classes" value={stats?.total_classes || 0} color="blue" delay={0} />
        <StatsCard icon="✅" title="Full" value={stats?.full || 0} color="green" delay={0.1} />
        <StatsCard icon="⚠️" title="Partial" value={stats?.partial || 0} color="amber" delay={0.2} />
        <StatsCard icon="🔴" title="Suspicious" value={stats?.suspicious || 0} color="red" delay={0.3} />
        <StatsCard icon="❌" title="Absent" value={stats?.absent || 0} color="orange" delay={0.4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Subject-wise */}
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 mb-4">📚 Subject-wise Breakdown</h3>
          {subjectData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={subjectData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, color: '#f1f5f9' }}
                  formatter={(val, name, props) => [`${val}% (${props.payload.present}/${props.payload.total})`, 'Attendance']} />
                <Bar dataKey="percentage" radius={[0, 6, 6, 0]}>
                  {subjectData.map((entry, i) => (
                    <Cell key={i} fill={entry.percentage >= 75 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center py-12 text-surface-500">No subject data</p>}
        </div>

        {/* Pie breakdown */}
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-surface-900 dark:text-surface-100 mb-4">🥧 Status Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={5} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 12, color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center py-12 text-surface-500">No data</p>}
        </div>
      </div>

      {/* Subject Table */}
      {subjectData.length > 0 && (
        <div className="glass-card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr><th>Subject</th><th>Total</th><th>Present</th><th>Absent</th><th>Percentage</th><th>Status</th></tr>
            </thead>
            <tbody>
              {subjectData.map(s => (
                <tr key={s.name}>
                  <td className="font-semibold">{s.name}</td>
                  <td>{s.total}</td>
                  <td className="text-emerald-600 font-semibold">{s.present}</td>
                  <td className="text-red-600 font-semibold">{s.absent}</td>
                  <td className="font-bold">{s.percentage}%</td>
                  <td>
                    <span className={`badge ${s.percentage >= 75 ? 'badge-full' : 'badge-suspicious'}`}>
                      {s.percentage >= 75 ? 'Safe' : 'At Risk'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
