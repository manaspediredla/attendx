import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { PencilSquareIcon, CameraIcon, UserCircleIcon } from '@heroicons/react/24/outline';

export default function StudentProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await api.get('/auth/me');
      setProfile(res.data);
      setFormData({
        name: res.data.name || '',
        email: res.data.email || '',
        gender: res.data.student?.gender || '',
      });
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', {
        full_name: formData.name,
        email: formData.email,
        gender: formData.gender,
      });
      setProfile(prev => ({ ...prev, name: res.data.user.name, email: res.data.user.email, student: res.data.student }));
      toast.success('Profile updated');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png'].includes(file.type)) {
      toast.error('Only JPG and PNG images are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!previewImage) return;
    setUploading(true);
    try {
      const base64 = previewImage.split(',')[1];
      await api.post('/auth/profile-photo', { image: base64 });
      toast.success('Profile photo updated');
      setPreviewImage(null);
      fetchProfile();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>;

  const student = profile?.student;
  const profileImage = student?.profile_image ? `data:image/jpeg;base64,${student.profile_image}` : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-1">My Profile</h1>
        <p className="text-sm text-surface-500">ATTENDX — Student Identity</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        {/* Header Banner */}
        <div className="h-24 relative" style={{ background: 'linear-gradient(135deg, #1F2630, #2A3240, #1F2630)' }}>
          <div className="absolute -bottom-12 left-6">
            <div className="relative group">
              {profileImage || previewImage ? (
                <img src={previewImage || profileImage} alt="Profile" className="w-24 h-24 rounded-2xl object-cover border-4 border-surface-950 shadow-xl" />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-surface-600 to-surface-700 flex items-center justify-center text-surface-300 text-3xl font-black border-4 border-surface-950 shadow-xl">
                  {profile?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 order border-border/60 flex items-center justify-center text-surface-400 hover:text-surface-700 dark:text-surface-200 transition-colors opacity-0 group-hover:opacity-100"
              >
                <CameraIcon className="w-4 h-4" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png" className="hidden" onChange={handlePhotoSelect} />
            </div>
          </div>
        </div>

        <div className="pt-16 px-6 pb-6">
          {/* Preview Upload Bar */}
          {previewImage && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4 p-3 rounded-xl bg-surface-900/50 border border-border/40 flex items-center justify-between">
              <p className="text-xs text-surface-400">New photo selected — face validation required</p>
              <div className="flex gap-2">
                <button onClick={() => setPreviewImage(null)} className="btn-secondary btn-sm">Cancel</button>
                <button onClick={handlePhotoUpload} disabled={uploading} className="btn-primary btn-sm">
                  {uploading ? <><span className="spinner w-3 h-3" /> Validating...</> : 'Upload'}
                </button>
              </div>
            </motion.div>
          )}

          {/* Name & Role */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-surface-900 dark:text-surface-100">{profile?.name}</h2>
              <p className="text-sm text-surface-500">{profile?.email}</p>
            </div>
            <button
              onClick={() => setEditing(!editing)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                editing
                  ? 'bg-surface-800 text-surface-400 border-border/40'
                  : 'bg-surface-800/50 text-surface-400 border-border/30 hover:text-surface-700 dark:text-surface-200 hover:border-border/60'
              }`}
            >
              <PencilSquareIcon className="w-4 h-4" />
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
          </div>

          {/* Editable Form or Read-only Details */}
          {editing ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Full Name</label>
                <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Gender</label>
                <select value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})} className="input-field w-full">
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2.5">
                {saving ? <><span className="spinner w-4 h-4" /> Saving...</> : 'Save Changes'}
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Student ID', value: student?.id },
                { label: 'Gender', value: student?.gender },
                { label: 'Department', value: student?.department },
                { label: 'Section', value: student?.section },
                { label: 'Year', value: student?.year ? `Year ${student.year}` : '—' },
                { label: 'College', value: student?.college_name },
                { label: 'Campus City', value: student?.city_name },
                { label: 'Face Status', value: student?.face_registered ? 'Enrolled' : 'Pending', highlight: true },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-surface-900/50 rounded-xl p-3 border border-border/20"
                >
                  <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.highlight ? (student?.face_registered ? 'text-emerald-400/80' : 'text-amber-400/80') : 'text-surface-200'}`}>
                    {item.value || '—'}
                  </p>
                </motion.div>
              ))}
            </div>
          )}

          {/* Info Note */}
          <div className="mt-5 bg-surface-900/50 rounded-xl p-3 flex items-start gap-2 border border-border/20">
            <UserCircleIcon className="w-5 h-5 text-surface-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-surface-500">
              You can edit your name, email, and gender. Fields like Student ID, Department, Section, College, and City are managed by your teacher.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
