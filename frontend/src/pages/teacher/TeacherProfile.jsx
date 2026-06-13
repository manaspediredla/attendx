import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { UserCircleIcon, CameraIcon, PencilIcon } from '@heroicons/react/24/outline';

export default function TeacherProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/teacher/profile')
      .then(res => {
        setProfile(res.data);
        setForm({
          name: res.data.name || '',
          department: res.data.department || '',
          designation: res.data.designation || '',
          campus: res.data.campus || '',
          gender: res.data.gender || '',
        });
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/teacher/profile', form);
      setProfile(prev => ({ ...prev, ...res.data.profile }));
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await api.put('/teacher/profile', { profile_image: reader.result });
        setProfile(prev => ({ ...prev, profile_image: reader.result, ...res.data.profile }));
        toast.success('Profile picture updated!');
      } catch {
        toast.error('Failed to upload image');
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  const fields = [
    { key: 'name', label: 'Full Name' },
    { key: 'department', label: 'Department' },
    { key: 'designation', label: 'Designation' },
    { key: 'campus', label: 'Campus' },
    { key: 'gender', label: 'Gender' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">👤 My Profile</h1>

      <div className="glass-card p-8">
        {/* Profile Image */}
        <div className="flex items-center gap-6 mb-8">
          <div className="relative group">
            {profile?.profile_image ? (
              <img src={profile.profile_image} alt="Profile" className="w-24 h-24 rounded-2xl object-cover border-2 border-surface-200 dark:border-surface-700" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-surface-200 to-surface-300 dark:from-surface-700 dark:to-surface-600 flex items-center justify-center">
                <UserCircleIcon className="w-12 h-12 text-surface-400" />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-surface-600 hover:bg-surface-500 text-white flex items-center justify-center transition-colors shadow-lg"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">{profile?.name || 'Teacher'}</h2>
            <p className="text-sm text-surface-500">{profile?.email}</p>
            {profile?.teacher_id && <p className="text-xs text-surface-500 mt-0.5">ID: {profile.teacher_id}</p>}
          </div>
        </div>

        {/* Profile Fields */}
        <div className="space-y-4">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1.5">{label}</label>
              {editing ? (
                key === 'gender' ? (
                  <select
                    value={form[key] || ''}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form[key] || ''}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="input-field"
                  />
                )
              ) : (
                <p className="text-surface-900 dark:text-surface-100 py-2 px-3 bg-surface-50 dark:bg-white/5 rounded-lg">
                  {profile?.[key] || '—'}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => { setEditing(false); setForm({ name: profile?.name || '', department: profile?.department || '', designation: profile?.designation || '', campus: profile?.campus || '', gender: profile?.gender || '' }); }} className="btn-secondary">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">
              <PencilIcon className="w-4 h-4" /> Edit Profile
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
