import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { PlusIcon, PencilSquareIcon, TrashIcon, KeyIcon, CloudArrowUpIcon, FunnelIcon } from '@heroicons/react/24/outline';

export default function TeacherManagement() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [form, setForm] = useState({
    name: '', email: '', teacher_id: '', gender: '', department: '', campus: '', designation: '',
  });

  // Filters
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [filterOptions, setFilterOptions] = useState({ departments: [], campuses: [], genders: [] });

  // CSV import
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const fetchTeachers = () => {
    api.get('/admin/teachers').then(res => setTeachers(res.data.teachers || []))
      .catch(() => toast.error('Failed to load teachers'))
      .finally(() => setLoading(false));
  };

  const fetchFilters = () => {
    api.get('/admin/teachers/filters').then(r => setFilterOptions(r.data)).catch(() => {});
  };

  useEffect(() => { fetchTeachers(); fetchFilters(); }, []);

  const openCreate = () => {
    setEditTeacher(null);
    setForm({ name: '', email: '', teacher_id: '', gender: '', department: '', campus: '', designation: '' });
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditTeacher(t);
    setForm({
      name: t.name || '',
      email: t.email || '',
      teacher_id: t.teacher_id || '',
      gender: t.gender || '',
      department: t.department || '',
      campus: t.campus || '',
      designation: t.designation || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editTeacher) {
        await api.put(`/admin/teachers/${editTeacher.user_id || editTeacher.id}`, form);
        toast.success('Teacher updated');
      } else {
        const res = await api.post('/admin/teachers', form);
        toast.success(`Teacher created! Default password: ${res.data.default_password}`);
      }
      setShowModal(false);
      setEditTeacher(null);
      fetchTeachers();
      fetchFilters();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (t) => {
    if (!confirm(`Delete teacher ${t.name}?`)) return;
    try {
      await api.delete(`/admin/teachers/${t.user_id || t.id}`);
      toast.success('Teacher deleted');
      fetchTeachers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleResetPassword = async (t) => {
    try {
      const res = await api.post(`/admin/reset-password/${t.user_id || t.id}`);
      toast.success(`Password reset to: ${res.data.default_password}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleToggleActive = async (t) => {
    try {
      await api.put(`/admin/teachers/${t.user_id || t.id}`, { is_active: !t.is_active });
      toast.success(`Teacher ${t.is_active ? 'disabled' : 'enabled'}`);
      fetchTeachers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleCSVUpload = async () => {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post('/admin/import-teachers-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      toast.success(`Imported ${res.data.success_count} teachers!`);
      fetchTeachers();
      fetchFilters();
    } catch (err) {
      setImportResult(err.response?.data || {});
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Filter teachers client-side
  const filtered = teachers.filter(t => {
    if (search) {
      const s = search.toLowerCase();
      if (!(t.name || '').toLowerCase().includes(s) &&
          !(t.email || '').toLowerCase().includes(s) &&
          !(t.teacher_id || '').toLowerCase().includes(s)) return false;
    }
    if (filterDept && t.department !== filterDept) return false;
    if (filterCampus && t.campus !== filterCampus) return false;
    if (filterGender && t.gender !== filterGender) return false;
    return true;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="spinner border-surface-400 w-8 h-8" /></div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100">👨‍🏫 Teacher Management</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCSVModal(true)} className="btn-secondary">
            <CloudArrowUpIcon className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={openCreate} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Teacher
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input placeholder="Search name, email, ID..." value={search}
            onChange={e => setSearch(e.target.value)} className="input-field md:col-span-2" />
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field">
            <option value="">All Departments</option>
            {filterOptions.departments?.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterCampus} onChange={e => setFilterCampus(e.target.value)} className="input-field">
            <option value="">All Campuses</option>
            {filterOptions.campuses?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Teacher ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Dept</th>
                <th>Campus</th>
                <th>Gender</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.user_id || t.id}>
                  <td className="font-mono text-xs">{t.teacher_id || '—'}</td>
                  <td className="font-semibold">{t.name}</td>
                  <td className="text-surface-500">{t.email}</td>
                  <td>{t.department || '—'}</td>
                  <td>{t.campus || '—'}</td>
                  <td>{t.gender || '—'}</td>
                  <td>{t.designation || '—'}</td>
                  <td>
                    <button onClick={() => handleToggleActive(t)} className={`badge ${t.is_active ? 'badge-full' : 'badge-absent'} cursor-pointer`}>
                      {t.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="text-xs">{t.last_login ? new Date(t.last_login).toLocaleString() : 'Never'}</td>
                  <td>
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(t)} className="btn-icon btn-sm w-8 h-8" title="Edit">
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleResetPassword(t)} className="btn-icon btn-sm w-8 h-8" title="Reset Password">
                        <KeyIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(t)} className="btn-icon btn-sm w-8 h-8 hover:!bg-red-50 hover:!text-red-500 dark:hover:!bg-red-900/20" title="Delete">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan="10" className="text-center py-8 text-surface-500">No teachers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editTeacher ? 'Edit Teacher' : 'Add Teacher'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">Full Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email Address *</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Teacher ID</label>
              <input type="text" value={form.teacher_id} onChange={e => setForm({ ...form, teacher_id: e.target.value })} className="input-field" placeholder="e.g. T001" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Department</label>
              <input type="text" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Campus</label>
              <input type="text" value={form.campus} onChange={e => setForm({ ...form, campus: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Designation</label>
              <input type="text" value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} className="input-field" placeholder="e.g. Associate Professor" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Gender</label>
              <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className="input-field">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          {!editTeacher && (
            <p className="text-sm text-surface-500 bg-surface-800/50 p-3 rounded-xl">
              Default password: <code className="text-surface-400 font-mono">Teacher@123</code> — Must change on first login.
            </p>
          )}
          <button type="submit" className="btn-primary w-full">{editTeacher ? 'Update' : 'Create'} Teacher</button>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal isOpen={showCSVModal} onClose={() => { setShowCSVModal(false); setCsvFile(null); setImportResult(null); }} title="Import Teachers from CSV" size="md">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            Upload a CSV with columns: <strong>full_name, email</strong> (required), and optionally: <strong>teacher_id, gender, department, campus, designation</strong>
          </p>
          <div className="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-8 text-center">
            {csvFile ? (
              <div>
                <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{csvFile.name}</p>
                <p className="text-xs text-surface-500 mt-1">{(csvFile.size / 1024).toFixed(1)} KB</p>
                <button onClick={() => setCsvFile(null)} className="text-xs text-red-400 mt-2">Remove</button>
              </div>
            ) : (
              <>
                <CloudArrowUpIcon className="w-10 h-10 mx-auto text-surface-400 mb-2" />
                <p className="text-sm text-surface-500 mb-2">Click to select a CSV file</p>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary btn-sm">Choose File</button>
              </>
            )}
          </div>
          {importResult && (
            <div className={`rounded-lg p-3 text-sm ${importResult.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {importResult.success ? (
                <p>✅ {importResult.success_count} imported, {importResult.duplicate_count} duplicates, {importResult.failed_count} failed</p>
              ) : (
                <p>❌ {importResult.errors?.[0]?.error || importResult.errors?.[0] || 'Import failed'}</p>
              )}
            </div>
          )}
          <button onClick={handleCSVUpload} disabled={!csvFile || importing} className="btn-primary w-full">
            {importing ? <><span className="spinner" /> Importing...</> : 'Upload & Import'}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
