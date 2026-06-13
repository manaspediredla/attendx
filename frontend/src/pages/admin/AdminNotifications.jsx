import { useState, useEffect } from 'react';
import api from '../../api/axios';

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSendForm, setShowSendForm] = useState(false);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await api.post('/notifications/send', {
        message,
        subject,
        send_email: sendEmail,
        student_ids: [],
      });
      setMessage('');
      setSubject('');
      setShowSendForm(false);
      fetchNotifications();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2 className="page-title">Notifications</h2>
        <button className="btn btn--primary" onClick={() => setShowSendForm(!showSendForm)}>
          {showSendForm ? '✕ Cancel' : '📤 Send Notification'}
        </button>
      </div>

      {/* Send Form */}
      {showSendForm && (
        <div className="form-card">
          <h3>Send Notification to All Students</h3>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <input className="form-input" value={subject}
              onChange={(e) => setSubject(e.target.value)} placeholder="Notification subject" />
          </div>
          <div className="form-group">
            <label className="form-label">Message *</label>
            <textarea className="form-input form-textarea" rows="4" value={message}
              onChange={(e) => setMessage(e.target.value)} placeholder="Type your message..." />
          </div>
          <div className="form-group form-checkbox">
            <label>
              <input type="checkbox" checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)} />
              <span>Also send as email</span>
            </label>
          </div>
          <button className="btn btn--primary" onClick={sendNotification} disabled={sending}>
            {sending ? '⏳ Sending...' : '📤 Send to All Students'}
          </button>
        </div>
      )}

      {/* Notification List */}
      <div className="notification-list">
        {loading ? (
          <div className="loading-spinner">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <p>No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`notification-item ${!n.is_read ? 'notification-item--unread' : ''}`}>
              <div className="notification-item__icon">
                {n.type === 'attendance_warning' ? '⚠️' : n.type === 'custom' ? '📨' : '🔔'}
              </div>
              <div className="notification-item__content">
                <span className="notification-item__student">{n.student_name}</span>
                <p className="notification-item__message">{n.message}</p>
                <span className="notification-item__time">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              <span className={`badge badge--${n.type === 'attendance_warning' ? 'warning' : 'info'}`}>
                {n.type.replace('_', ' ')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
