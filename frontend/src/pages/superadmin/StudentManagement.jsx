import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { CloudArrowUpIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [filterOptions, setFilterOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '', college: '', city: '', department: '', section: '', gender: '',
    sort_by: 'id', sort_order: 'asc',
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // CSV import
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Manual create/edit
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({
    full_name: '', email: '', roll_number: '', department: '', section: '',
    year: '1', gender: '', college_name: '', city_name: '',
  });

  useEffect(() => {
    api.get('/admin/students/filters').then(r => setFilterOptions(r.data)).catch(() => {});
  }, []);

  const fetchStudents = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, per_page: 50 });
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    api.get(`/admin/students?${params}`)
      .then(r => { setStudents(r.data.students || []); setTotal(r.data.total || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStudents(); }, [filters, page]);

  // CSV Import
  const handleCSVUpload = async () => {
    if (!csvFile) return;
    setImporting(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post('/admin/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      toast.success(`Imported ${res.data.success_count} students!`);
      fetchStudents();
      api.get('/admin/students/filters').then(r => setFilterOptions(r.data)).catch(() => {});
    } catch (err) {
      setImportResult(err.response?.data || {});
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Create / Edit Student
  const openCreateModal = () => {
    setEditingStudent(null);
    setStudentForm({
      full_name: '', email: '', roll_number: '', department: '', section: '',
      year: '1', gender: '', college_name: '', city_name: '',
    });
    setShowStudentModal(true);
  };

  const openEditModal = (s) => {
    setEditingStudent(s);
    setStudentForm({
      full_name: s.full_name || s.name || '',
      email: s.email || '',
      roll_number: s.id || s.roll_number || '',
      department: s.department || '',
      section: s.section || '',
      year: String(s.year || 1),
      gender: s.gender || '',
      college_name: s.college_name || '',
      city_name: s.city_name || '',
    });
    setShowStudentModal(true);
  };

  const handleSaveStudent = async () => {
    setSaving(true);
    try {
      if (editingStudent) {
        await api.put(`/admin/students/${editingStudent.id}`, studentForm);
        toast.success('Student updated!');
      } else {
        await api.post('/admin/students', studentForm);
        toast.success('Student created!');
      }
      setShowStudentModal(false);
      fetchStudents();
      api.get('/admin/students/filters').then(r => setFilterOptions(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Delete student ${s.full_name || s.name} (${s.id})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/students/${s.id}`);
      toast.success('Student deleted');
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const faceBadge = (status) => (
    <span className={status === 'enrolled' ? 'badge-full' : 'badge-partial'}>
      {status === 'enrolled' ? 'Enrolled' : 'Pending'}
    </span>
  );

  const colleges = filterOptions.colleges || filterOptions.campuses || [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100">👨‍🎓 All Students</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCSVModal(true)} className="btn-secondary">
            <CloudArrowUpIcon className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={openCreateModal} className="btn-primary">
            <PlusIcon className="w-4 h-4" /> Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input placeholder="Search name, ID, email..." value={filters.search}
            onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
            className="input-field md:col-span-2" />
          <select value={filters.college} onChange={e => { setFilters({ ...filters, college: e.target.value }); setPage(1); }} className="input-field">
            <option value="">All Colleges</option>
            {colleges.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.city} onChange={e => { setFilters({ ...filters, city: e.target.value }); setPage(1); }} className="input-field">
            <option value="">All Cities</option>
            {(filterOptions.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.department} onChange={e => { setFilters({ ...filters, department: e.target.value }); setPage(1); }} className="input-field">
            <option value="">All Departments</option>
            {(filterOptions.departments || []).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.section} onChange={e => { setFilters({ ...filters, section: e.target.value }); setPage(1); }} className="input-field">
            <option value="">All Sections</option>
            {(filterOptions.sections || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.gender} onChange={e => { setFilters({ ...filters, gender: e.target.value }); setPage(1); }} className="input-field">
            <option value="">All Genders</option>
            {(filterOptions.genders || []).map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filters.sort_by} onChange={e => setFilters({ ...filters, sort_by: e.target.value })} className="input-field">
            <option value="id">Sort: ID</option>
            <option value="name">Sort: Name</option>
            <option value="college">Sort: College</option>
            <option value="attendance_percentage">Sort: Attendance %</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner border-surface-400 w-8 h-8" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-surface-500 border-b border-white/10 bg-white/5">
                  <th className="p-3">Name</th>
                  <th className="p-3">ID</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Gender</th>
                  <th className="p-3">College</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Dept</th>
                  <th className="p-3">Section</th>
                  <th className="p-3">Attendance %</th>
                  <th className="p-3">Face</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.internal_id || s.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 font-medium">{s.full_name || s.name}</td>
                    <td className="p-3">{s.id}</td>
                    <td className="p-3 text-surface-500">{s.email}</td>
                    <td className="p-3">{s.gender || '—'}</td>
                    <td className="p-3">{s.college_name || '—'}</td>
                    <td className="p-3">{s.city_name || '—'}</td>
                    <td className="p-3">{s.department}</td>
                    <td className="p-3">{s.section}</td>
                    <td className="p-3">
                      <span className={s.attendance_percentage >= 75 ? 'text-emerald-400' : 'text-red-400'}>
                        {s.attendance_percentage}%
                      </span>
                    </td>
                    <td className="p-3">{faceBadge(s.face_enrollment_status)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEditModal(s)} className="p-1.5 rounded-lg hover:bg-white/10 text-surface-400 hover:text-surface-200 transition-colors" title="Edit">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(s)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-surface-400 hover:text-red-400 transition-colors" title="Delete">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 flex justify-between items-center text-sm text-surface-500">
              <span>{total} students total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary text-xs">Prev</button>
                <button disabled={students.length < 50} onClick={() => setPage(p => p + 1)} className="btn-secondary text-xs">Next</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      <Modal isOpen={showCSVModal} onClose={() => { setShowCSVModal(false); setCsvFile(null); setImportResult(null); }} title="Import Students from CSV" size="md">
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            Upload a CSV file with columns: <strong>id, full_name, email, gender, department, section, college_name, city_name, year</strong>
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
                <p className="text-sm text-surface-500 mb-2">Click to select or drag a CSV file</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={e => setCsvFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
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

      {/* Create / Edit Student Modal */}
      <Modal isOpen={showStudentModal} onClose={() => setShowStudentModal(false)} title={editingStudent ? 'Edit Student' : 'Add New Student'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Full Name *</label>
              <input type="text" value={studentForm.full_name} onChange={e => setStudentForm({ ...studentForm, full_name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input type="email" value={studentForm.email} onChange={e => setStudentForm({ ...studentForm, email: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Roll Number *</label>
              <input type="text" value={studentForm.roll_number} onChange={e => setStudentForm({ ...studentForm, roll_number: e.target.value })} className="input-field" disabled={!!editingStudent} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department *</label>
              <input type="text" value={studentForm.department} onChange={e => setStudentForm({ ...studentForm, department: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Section *</label>
              <input type="text" value={studentForm.section} onChange={e => setStudentForm({ ...studentForm, section: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">College *</label>
              <input type="text" value={studentForm.college_name} onChange={e => setStudentForm({ ...studentForm, college_name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City *</label>
              <input type="text" value={studentForm.city_name} onChange={e => setStudentForm({ ...studentForm, city_name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Year</label>
              <select value={studentForm.year} onChange={e => setStudentForm({ ...studentForm, year: e.target.value })} className="input-field">
                {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Gender</label>
              <select value={studentForm.gender} onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })} className="input-field">
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
          <button onClick={handleSaveStudent} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editingStudent ? 'Update Student' : 'Create Student'}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
