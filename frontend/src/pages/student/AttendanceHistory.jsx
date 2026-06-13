import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function AttendanceHistory() {
  const { studentId } = useAuth();
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');

  useEffect(() => {
    if (!studentId) return;
    api.get(`/attendance/student/${studentId}${subject ? `?subject=${subject}` : ''}`).then(res => {
      setRecords(res.data.records || []);
      setStats(res.data.stats || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [studentId, subject]);

  const statusBadge = {
    full: 'badge-full', partial: 'badge-partial',
    suspicious: 'badge-suspicious', absent: 'badge-absent',
    present_start: 'badge-active', present_end: 'badge-partial',
  };

  const statusLabel = {
    full: 'Full ✅', partial: 'Partial ⚠️',
    suspicious: 'Suspicious 🔴', absent: 'Absent ❌',
    present_start: 'Start ✓', present_end: 'End ✓',
  };

  const subjects = stats?.subject_wise ? Object.keys(stats.subject_wise) : [];

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📋 Attendance History</h1>

      {/* Subject Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setSubject('')} className={`btn-sm ${!subject ? 'btn-primary' : 'btn-secondary'}`}>All</button>
        {subjects.map(s => (
          <button key={s} onClick={() => setSubject(s)} className={`btn-sm ${subject === s ? 'btn-primary' : 'btn-secondary'}`}>{s}</button>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Subject</th>
              <th>Section</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>GPS</th>
              <th>Network</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={r.id || i}>
                <td className="text-xs whitespace-nowrap">{r.start_marked_at ? new Date(r.start_marked_at).toLocaleDateString() : '—'}</td>
                <td className="font-medium">{r.subject || '—'}</td>
                <td>{r.section || '—'}</td>
                <td><span className={`badge ${statusBadge[r.status]}`}>{statusLabel[r.status] || r.status}</span></td>
                <td className="text-xs">
                  {r.start_marked_at ? new Date(r.start_marked_at).toLocaleTimeString() : '—'}
                  {r.start_confidence && <span className="text-surface-400 ml-1">({(r.start_confidence * 100).toFixed(0)}%)</span>}
                </td>
                <td className="text-xs">
                  {r.end_marked_at ? new Date(r.end_marked_at).toLocaleTimeString() : '—'}
                  {r.end_confidence && <span className="text-surface-400 ml-1">({(r.end_confidence * 100).toFixed(0)}%)</span>}
                </td>
                <td>{r.gps_validated ? '✅' : '—'}</td>
                <td>{r.network_validated ? '✅' : '—'}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan="8" className="text-center py-8 text-surface-500">No attendance records found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
