import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { BellIcon, CheckCircleIcon, ExclamationTriangleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  const fetch = () => {
    api.get('/notifications').then(res => {
      setNotifications(res.data.notifications || []);
      setUnread(res.data.unread_count || 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, []);

  const markAllRead = async () => {
    try {
      await api.put('/notifications/mark-all-read');
      fetch();
      toast.success('All marked as read');
    } catch { toast.error('Failed'); }
  };

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetch();
    } catch {}
  };

  const getIcon = (type) => {
    switch (type) {
      case 'attendance_warning': return <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />;
      case 'custom': return <EnvelopeIcon className="w-5 h-5 text-surface-400" />;
      default: return <BellIcon className="w-5 h-5 text-surface-400" />;
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100">
          🔔 Notifications {unread > 0 && <span className="badge badge-active ml-2">{unread} new</span>}
        </h1>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary btn-sm">
            <CheckCircleIcon className="w-4 h-4" /> Mark All Read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`glass-card p-4 flex items-start gap-4 cursor-pointer transition-all ${!n.is_read ? 'border-l-4 border-l-brand-500' : ''}`}
            onClick={() => !n.is_read && markRead(n.id)}
          >
            <div className="shrink-0 mt-0.5">{getIcon(n.type)}</div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${!n.is_read ? 'font-semibold text-surface-100' : 'text-surface-400 '}`}>
                {n.message}
              </p>
              <p className="text-xs text-surface-500 mt-1">
                {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
              </p>
            </div>
            {!n.is_read && <div className="w-2.5 h-2.5 rounded-full bg-surface-600 shrink-0 mt-1.5" />}
          </motion.div>
        ))}
        {notifications.length === 0 && (
          <div className="glass-card p-12 text-center">
            <BellIcon className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-400 mb-3" />
            <p className="text-surface-500">No notifications</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
