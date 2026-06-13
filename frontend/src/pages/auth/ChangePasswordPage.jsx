import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { LockClosedIcon } from '@heroicons/react/24/outline';

export default function ChangePasswordPage() {
  const { passwordChanged, user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await api.put('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success('Password changed successfully');
      passwordChanged();

      const defaultPaths = { super_admin: '/superadmin', teacher: '/teacher', student: '/student' };
      navigate(defaultPaths[user?.role] || '/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto mt-12"
    >
      <div className="glass-card p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 flex items-center justify-center mx-auto mb-4">
            <LockClosedIcon className="w-7 h-7 text-surface-400" />
          </div>
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">Update Password</h2>
          <p className="text-xs text-surface-500 mt-1">ATTENDX Security</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" required />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" required minLength={6} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" required minLength={6} />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
            {loading ? <span className="spinner w-4 h-4" /> : null}
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
