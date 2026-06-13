import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { PlusIcon, PencilSquareIcon, TrashIcon, WifiIcon } from '@heroicons/react/24/outline';

export default function NetworkManagement() {
  const [networks, setNetworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name: '', ssid: '', public_ip: '', vpn_range: '' });
  const [detectingIp, setDetectingIp] = useState(false);

  const fetch = () => {
    api.get('/admin/networks').then(res => setNetworks(res.data || []))
      .catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  };
  useEffect(() => { fetch(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editItem) { await api.put(`/admin/networks/${editItem.id}`, form); toast.success('Updated'); }
      else { await api.post('/admin/networks', form); toast.success('Added'); }
      setShowModal(false); setEditItem(null); setForm({ name: '', ssid: '', public_ip: '', vpn_range: '' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const detectPublicIp = async () => {
    setDetectingIp(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      if (data?.ip) {
        setForm(prev => ({ ...prev, public_ip: data.ip }));
        toast.success(`Detected public IP: ${data.ip}`);
      } else {
        toast.error('Could not detect public IP');
      }
    } catch {
      toast.error('Could not detect public IP');
    } finally {
      setDetectingIp(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this network?')) return;
    try { await api.delete(`/admin/networks/${id}`); toast.success('Deleted'); fetch(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100">📡 Network Configuration</h1>
        <button onClick={() => { setEditItem(null); setForm({ name: '', ssid: '', public_ip: '', vpn_range: '' }); setShowModal(true); }} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Add Network
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>SSID</th><th>Public IP</th><th>VPN Range</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {networks.map(n => (
              <tr key={n.id}>
                <td className="font-semibold">{n.name}</td>
                <td><code className="text-xs bg-surface-100 dark:bg-surface-800 g-surface-800 px-2 py-1 rounded">{n.ssid || '—'}</code></td>
                <td><code className="text-xs bg-surface-100 dark:bg-surface-800 g-surface-800 px-2 py-1 rounded">{n.public_ip || '—'}</code></td>
                <td><code className="text-xs bg-surface-100 dark:bg-surface-800 g-surface-800 px-2 py-1 rounded">{n.vpn_range || '—'}</code></td>
                <td><span className={`badge ${n.is_active ? 'badge-full' : 'badge-absent'}`}>{n.is_active ? 'Active' : 'Disabled'}</span></td>
                <td>
                  <div className="flex gap-1.5">
                    <button onClick={() => { setEditItem(n); setForm({ name: n.name, ssid: n.ssid||'', public_ip: n.public_ip||'', vpn_range: n.vpn_range||'' }); setShowModal(true); }} className="btn-icon btn-sm w-8 h-8"><PencilSquareIcon className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(n.id)} className="btn-icon btn-sm w-8 h-8 hover:!bg-red-50 hover:!text-red-500 dark:hover:!bg-red-900/20"><TrashIcon className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {networks.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-surface-500">No networks configured</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Network' : 'Add Network'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Name</label><input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">WiFi SSID (optional)</label><input type="text" value={form.ssid} onChange={e => setForm({...form, ssid: e.target.value})} className="input-field" placeholder="Campus-WiFi" /></div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Public IP</label>
            <div className="flex gap-2">
              <input type="text" value={form.public_ip} onChange={e => setForm({...form, public_ip: e.target.value})} className="input-field flex-1" placeholder="106.215.171.39" />
              <button type="button" onClick={detectPublicIp} disabled={detectingIp} className="btn-secondary whitespace-nowrap">
                {detectingIp ? 'Detecting...' : 'Detect IP'}
              </button>
            </div>
            <p className="text-xs text-surface-500 mt-1.5">
              Use your WiFi&apos;s public IP (same for all devices on that network). Click Detect while on campus WiFi.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-300  mb-1.5">Local / VPN Range (CIDR)</label>
            <input type="text" value={form.vpn_range} onChange={e => setForm({...form, vpn_range: e.target.value})} className="input-field" placeholder="192.168.0.0/16" />
            <p className="text-xs text-surface-500 mt-1.5">
              Optional. For LAN testing add <code className="text-surface-400">192.168.0.0/16</code> or <code className="text-surface-400">127.0.0.1</code> for localhost.
            </p>
          </div>
          <button type="submit" className="btn-primary w-full">{editItem ? 'Update' : 'Add'} Network</button>
        </form>
      </Modal>
    </motion.div>
  );
}
