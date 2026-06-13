import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function TeacherStudentList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [college, setCollege] = useState('');
  const [city, setCity] = useState('');
  const [department, setDepartment] = useState('');
  const [section, setSection] = useState('');
  const [colleges, setColleges] = useState([]);
  const [cities, setCities] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [editModal, setEditModal] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/teacher/colleges').then(r => setColleges(r.data || [])).catch(() => {});
    api.get('/teacher/cities').then(r => setCities(r.data || [])).catch(() => {});
    api.get('/teacher/departments').then(r => setDepartments(r.data || [])).catch(() => {});
    api.get('/teacher/sections').then(r => setSections(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchStudents(); }, [search, page, college, city, department, section]);

  const fetchStudents = () => {
    setLoading(true);
    const params = new URLSearchParams({ search, page, per_page: 20 });
    if (college) params.set('college', college);
    if (city) params.set('city', city);
    if (department) params.set('department', department);
    if (section) params.set('section', section);
    api.get(`/teacher/students?${params}`)
      .then(r => { setStudents(r.data.students || []); setTotal(r.data.total || 0); })
      .catch(() => {}).finally(() => setLoading(false));
  };

  const openEdit = (student) => {
    setEditStudent(student);
    setEditData({
      full_name: student.full_name || student.name || '',
      email: student.email || '',
      id: student.id || '',
      gender: student.gender || '',
      department: student.department || '',
      section: student.section || '',
      college_name: student.college_name || '',
      city_name: student.city_name || '',
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/students/${editStudent.internal_id}`, editData);
      toast.success('Student updated');
      setEditModal(false);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = { pending: 'badge-pending', registered: 'badge-registered', failed: 'badge-failed' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-1">Students</h1>
        <p className="text-sm text-surface-500">{total} enrolled</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, ID, email..." className="input-field max-w-xs" />
        <select value={college} onChange={e => { setCollege(e.target.value); setPage(1); }} className="input-field max-w-[180px]">
          <option value="">All Colleges</option>
          {colleges.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={city} onChange={e => { setCity(e.target.value); setPage(1); }} className="input-field max-w-[160px]">
          <option value="">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={department} onChange={e => { setDepartment(e.target.value); setPage(1); }} className="input-field max-w-[160px]">
          <option value="">All Depts</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={section} onChange={e => { setSection(e.target.value); setPage(1); }} className="input-field max-w-[140px]">
          <option value="">All Sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Name</th><th>ID</th><th>College</th><th>City</th><th>Dept</th><th>Sec</th><th>Face</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center py-8"><div className="spinner w-6 h-6 mx-auto" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-12">
                <p className="text-surface-500 text-sm">No students found</p>
              </td></tr>
            ) : students.map(s => (
              <tr key={s.internal_id || s.id}>
                <td className="font-semibold text-surface-700 dark:text-surface-200">{s.full_name || s.name}</td>
                <td className="font-mono text-xs">{s.id}</td>
                <td>{s.college_name || '—'}</td>
                <td>{s.city_name || '—'}</td>
                <td>{s.department}</td>
                <td>{s.section}</td>
                <td><span className={`badge ${statusBadge[s.face_registration_status]}`}>{s.face_registered ? 'enrolled' : s.face_registration_status}</span></td>
                <td>
                  <button onClick={() => openEdit(s)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-surface-400 bg-surface-100 dark:bg-surface-800 order border-border/40 hover:text-surface-700 dark:text-surface-200 hover:border-border transition-colors">
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="btn-secondary btn-sm">Previous</button>
        <span className="text-xs text-surface-500">Page {page}</span>
        <button onClick={() => setPage(p => p+1)} disabled={students.length < 20} className="btn-secondary btn-sm">Next</button>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={() => setEditModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-extrabold text-surface-900 dark:text-surface-100">Edit Student</h2>
                <button onClick={() => setEditModal(false)} className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 order border-border/40 flex items-center justify-center hover:bg-surface-700 transition-colors">
                  <XMarkIcon className="w-4 h-4 text-surface-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Full Name</label>
                  <input value={editData.full_name} onChange={e => setEditData({...editData, full_name: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Email</label>
                  <input type="email" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} className="input-field w-full" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Student ID</label>
                    <input value={editData.id} onChange={e => setEditData({...editData, id: e.target.value})} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Gender</label>
                    <select value={editData.gender} onChange={e => setEditData({...editData, gender: e.target.value})} className="input-field w-full">
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Department</label>
                    <input value={editData.department} onChange={e => setEditData({...editData, department: e.target.value})} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">Section</label>
                    <input value={editData.section} onChange={e => setEditData({...editData, section: e.target.value})} className="input-field w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">College</label>
                    <input value={editData.college_name} onChange={e => setEditData({...editData, college_name: e.target.value})} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-1">City</label>
                    <input value={editData.city_name} onChange={e => setEditData({...editData, city_name: e.target.value})} className="input-field w-full" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <><span className="spinner w-4 h-4" /> Saving...</> : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
