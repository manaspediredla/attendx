import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function SystemSettings() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});

  useEffect(() => {
    api.get('/admin/settings').then(res => {
      setSettings(res.data || []);
      const v = {};
      (res.data || []).forEach(s => { v[s.key] = s.value; });
      setValues(v);
    }).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsArr = Object.entries(values).map(([key, value]) => ({ key, value }));
      await api.put('/admin/settings', { settings: settingsArr });
      toast.success('Settings saved');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">⚙️ System Settings</h1>
      <div className="glass-card p-6 space-y-5">
        {settings.map(s => (
          <div key={s.key}>
            <label className="block text-sm font-semibold text-surface-700 dark:text-surface-300  mb-1">{s.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
            {s.description && <p className="text-xs text-surface-500 mb-1.5">{s.description}</p>}
            <input type="text" value={values[s.key] || ''} onChange={e => setValues({...values, [s.key]: e.target.value})} className="input-field" />
          </div>
        ))}
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full mt-4">{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </motion.div>
  );
}
