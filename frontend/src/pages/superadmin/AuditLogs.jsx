import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../../api/axios';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get(`/admin/audit-logs?page=${page}&per_page=30`).then(res => {
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">🛡️ Audit Logs <span className="text-sm font-normal text-surface-500">({total} entries)</span></h1>
      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                <td className="font-medium">{l.user_name || '—'}</td>
                <td><span className="badge badge-active">{l.action}</span></td>
                <td className="text-xs max-w-xs truncate">{l.details}</td>
                <td className="text-xs font-mono">{l.ip_address}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between mt-4">
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="btn-secondary btn-sm">Previous</button>
        <span className="text-sm text-surface-500">Page {page}</span>
        <button onClick={() => setPage(p => p+1)} disabled={logs.length < 30} className="btn-secondary btn-sm">Next</button>
      </div>
    </motion.div>
  );
}
