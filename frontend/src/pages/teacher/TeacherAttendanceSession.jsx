import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { PencilSquareIcon, ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

const PHASE_LABELS = {
  scheduled: 'Scheduled',
  start_window: 'Start Attendance Open',
  class_in_progress: 'Class In Progress',
  end_window: 'End Verification Open',
  completed: 'Completed',
};

/* ── Multi-select dropdown with "Select All" ── */
function MultiSelect({ label, options, selected, onChange, required }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isAll = selected.length === 1 && selected[0] === 'ALL';
  const allSelected = isAll || (selected.length === options.length && options.length > 0);

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(['ALL']);
  };

  const toggle = (val) => {
    if (isAll) {
      // switching from ALL to individual: select all except clicked
      onChange(options.filter(o => o !== val));
    } else if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      const next = [...selected, val];
      if (next.length === options.length) onChange(['ALL']);
      else onChange(next);
    }
  };

  const display = isAll ? 'All' : selected.length === 0 ? '' : selected.length <= 2 ? selected.join(', ') : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium mb-1.5">{label} {required && '*'}</label>
      <button type="button" onClick={() => setOpen(!open)}
        className="input-field w-full text-left flex items-center justify-between">
        <span className={display ? '' : 'text-surface-500'}>{display || 'Select...'}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-surface-800 border border-surface-600 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
          {/* Select All */}
          <button type="button" onClick={toggleAll}
            className="w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-white/10 border-b border-white/5 font-semibold">
            <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs
              ${allSelected ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-500'}`}>
              {allSelected && <CheckIcon className="w-3 h-3" />}
            </div>
            Select All (Universal)
          </button>
          {options.map(opt => {
            const checked = isAll || selected.includes(opt);
            return (
              <button key={opt} type="button" onClick={() => toggle(opt)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-white/10">
                <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs
                  ${checked ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-500'}`}>
                  {checked && <CheckIcon className="w-3 h-3" />}
                </div>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TeacherAttendanceSession() {
  const [activeSession, setActiveSession] = useState(null);
  const [liveRecords, setLiveRecords] = useState([]);
  const [starting, setStarting] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [sections, setSectionList] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [filters, setFilters] = useState({ college: '', city: '', department: '', section: '', subject: '' });

  // Edit session state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  // Sorting for live records
  const [sortField, setSortField] = useState('student_name');
  const [sortDir, setSortDir] = useState('asc');
  const [statusFilter, setStatusFilter] = useState('all');

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    subject: '',
    section: [],       // now arrays
    department: [],
    college: [],
    access_key: '',
    session_date: today,
    class_start_time: '10:00',
    attendance_monitoring_end: '10:10',
    meeting_end_time: '12:00',
    end_verification_start: '12:00',
    end_verification_end: '12:10',
  });

  useEffect(() => {
    api.get('/teacher/departments').then(r => setDepartments(r.data || [])).catch(() => {});
    api.get('/teacher/sections').then(r => setSectionList(r.data || [])).catch(() => {});
    api.get('/teacher/colleges').then(r => setColleges(r.data || [])).catch(() => {});
    loadActiveSession();
  }, []);

  const loadActiveSession = () => {
    api.get('/teacher/sessions?status=active&per_page=10').then(r => {
      const sessions = r.data.sessions || [];
      const active = sessions.find(s => s.status === 'active' || s.status === 'end_verification');
      if (active) setActiveSession(active);
    }).catch(() => {});
  };

  // Convert array to comma-separated for API
  const arrToStr = (arr) => Array.isArray(arr) ? arr.join(',') : arr;

  const createSession = async () => {
    if (!form.subject) { toast.error('Subject is required'); return; }
    if (form.section.length === 0) { toast.error('Select at least one section'); return; }
    if (form.department.length === 0) { toast.error('Select at least one department'); return; }
    if (form.college.length === 0) { toast.error('Select at least one college'); return; }
    if (!form.access_key.trim()) { toast.error('Session Access Key is required'); return; }

    setStarting(true);
    try {
      const payload = {
        ...form,
        section: arrToStr(form.section),
        department: arrToStr(form.department),
        college: arrToStr(form.college),
      };
      const res = await api.post('/attendance/start', payload);
      setActiveSession(res.data.session);
      toast.success(`Session #${res.data.session_id} created!`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create session');
    } finally {
      setStarting(false);
    }
  };

  const fetchLive = () => {
    if (!activeSession) return;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    api.get(`/attendance/live/${activeSession.id}?${params}`).then(r => {
      setLiveRecords(r.data.records || []);
      if (r.data.session) setActiveSession(r.data.session);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!activeSession) return;
    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, filters]);

  const endSession = async () => {
    if (!confirm('End this session and finalize all attendance?')) return;
    try {
      await api.post('/attendance/end', { session_id: activeSession.id });
      setActiveSession(null);
      setLiveRecords([]);
      toast.success('Session ended and finalized');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  // Parse comma-separated string back to array
  const strToArr = (s) => {
    if (!s) return [];
    if (s === 'ALL') return ['ALL'];
    return s.split(',').map(v => v.trim()).filter(Boolean);
  };

  const openEditModal = () => {
    if (!activeSession) return;
    const fmt = (dt) => dt ? dt.slice(11, 16) : '';
    setEditForm({
      subject: activeSession.subject || '',
      section: strToArr(activeSession.section),
      department: strToArr(activeSession.department),
      college: strToArr(activeSession.college || activeSession.campus),
      access_key: activeSession.access_key || '',
      session_date: activeSession.session_date || '',
      class_start_time: fmt(activeSession.attendance_window_start),
      attendance_monitoring_end: fmt(activeSession.attendance_window_end),
      meeting_end_time: fmt(activeSession.end_time),
      end_verification_start: fmt(activeSession.end_verification_start),
      end_verification_end: fmt(activeSession.end_verification_end),
      grace_period: String(activeSession.grace_period_minutes || 0),
    });
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/attendance/update-session', {
        session_id: activeSession.id,
        ...editForm,
        section: arrToStr(editForm.section),
        department: arrToStr(editForm.department),
        college: arrToStr(editForm.college),
      });
      setActiveSession(res.data.session);
      setShowEditModal(false);
      toast.success('Session updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = {
    present_start: 'badge-partial',
    present_end: 'badge-partial',
    full: 'badge-full',
    partial: 'badge-partial',
    suspicious: 'badge-suspicious',
    absent: 'badge-absent',
  };

  // Format display for multi-value field
  const displayMulti = (val) => {
    if (!val) return '—';
    if (val === 'ALL') return '🌐 All (Universal)';
    return val;
  };

  // Sorting logic
  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };
  const sortIcon = (field) => sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const sortedRecords = [...liveRecords]
    .filter(r => statusFilter === 'all' || (r.final_attendance_status || r.status) === statusFilter)
    .sort((a, b) => {
      let aVal = '', bVal = '';
      if (sortField === 'student_name') { aVal = a.student_name || ''; bVal = b.student_name || ''; }
      else if (sortField === 'roll_number') { aVal = a.roll_number || a.id || ''; bVal = b.roll_number || b.id || ''; }
      else if (sortField === 'college') { aVal = a.college_name || a.campus_name || ''; bVal = b.college_name || b.campus_name || ''; }
      else if (sortField === 'city') { aVal = a.city_name || ''; bVal = b.city_name || ''; }
      else if (sortField === 'status') { aVal = a.final_attendance_status || a.status || ''; bVal = b.final_attendance_status || b.status || ''; }
      else if (sortField === 'gps') { aVal = a.gps_validated ? '1' : '0'; bVal = b.gps_validated ? '1' : '0'; }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📋 Attendance Sessions</h1>

      {!activeSession ? (
        <div className="glass-card p-6 max-w-2xl">
          <h2 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4">Create Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1.5">Subject *</label>
              <input type="text" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1.5">Session Access Key *</label>
              <input type="text" value={form.access_key} onChange={e => setForm({ ...form, access_key: e.target.value })} placeholder="e.g. DBMS2026" className="input-field" />
              <p className="text-xs text-surface-500 mt-1">Students will need this key to join the session</p>
            </div>

            {/* Multi-select fields */}
            <MultiSelect label="Department" options={departments} selected={form.department}
              onChange={v => setForm({ ...form, department: v })} required />
            <MultiSelect label="Section" options={sections} selected={form.section}
              onChange={v => setForm({ ...form, section: v })} required />
            <div className="md:col-span-2">
              <MultiSelect label="College" options={colleges} selected={form.college}
                onChange={v => setForm({ ...form, college: v })} required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Session Date</label>
              <input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Class Start Time (IST)</label>
              <input type="time" value={form.class_start_time} onChange={e => setForm({ ...form, class_start_time: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Attendance Monitoring End</label>
              <input type="time" value={form.attendance_monitoring_end} onChange={e => setForm({ ...form, attendance_monitoring_end: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Meeting End Time</label>
              <input type="time" value={form.meeting_end_time} onChange={e => setForm({ ...form, meeting_end_time: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">End Verification Start</label>
              <input type="time" value={form.end_verification_start} onChange={e => setForm({ ...form, end_verification_start: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">End Verification End</label>
              <input type="time" value={form.end_verification_end} onChange={e => setForm({ ...form, end_verification_end: e.target.value })} className="input-field" />
            </div>
          </div>
          <button onClick={createSession} disabled={starting} className="btn-primary mt-6 w-full md:w-auto">
            {starting ? 'Creating...' : 'Create Session'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                  Session #{activeSession.id} — {activeSession.subject}
                </h2>
                <p className="text-sm text-surface-500 mt-1">
                  Section: {displayMulti(activeSession.section)} · Dept: {displayMulti(activeSession.department)} · {displayMulti(activeSession.college || activeSession.campus)}
                </p>
                <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-surface-600/20 text-surface-300">
                  {PHASE_LABELS[activeSession.phase] || activeSession.status}
                </span>
                {activeSession.access_key && (
                  <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-amber-400/80 mb-0.5">Session Access Key (share with students)</p>
                    <p className="text-lg font-bold tracking-wider text-amber-400">{activeSession.access_key}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={openEditModal} className="btn-secondary">
                  <PencilSquareIcon className="w-4 h-4" /> Edit Session
                </button>
                <button onClick={endSession} className="btn-danger">End Session</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-surface-500 block text-xs">Start Window</span>
                {activeSession.attendance_window_start?.slice(11, 16)} – {activeSession.attendance_window_end?.slice(11, 16)}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-surface-500 block text-xs">End Window</span>
                {activeSession.end_verification_start?.slice(11, 16)} – {activeSession.end_verification_end?.slice(11, 16)}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-surface-500 block text-xs">Full</span>
                {activeSession.full_count || 0}
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <span className="text-surface-500 block text-xs">Absent</span>
                {activeSession.absent_count || 0}
              </div>
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 className="font-bold">Filter & Sort</h3>
              <div className="flex items-center gap-2">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-sm !py-1.5 !px-2 !w-auto">
                  <option value="all">All Statuses</option>
                  <option value="present_start">Present (Start)</option>
                  <option value="present_end">Present (End)</option>
                  <option value="full">Full</option>
                  <option value="partial">Partial</option>
                  <option value="suspicious">Suspicious</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {['college', 'city', 'department', 'section', 'subject'].map(key => (
                <input
                  key={key}
                  placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
                  value={filters[key]}
                  onChange={e => setFilters({ ...filters, [key]: e.target.value })}
                  className="input-field text-sm"
                />
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-bold mb-4">Live Attendance ({sortedRecords.length}{statusFilter !== 'all' ? ` of ${liveRecords.length}` : ''})</h3>
            {sortedRecords.length === 0 ? (
              <p className="text-surface-500 text-sm">No attendance records yet. Students mark via their own devices.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-surface-500 border-b border-white/10">
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('student_name')}>Student{sortIcon('student_name')}</th>
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('roll_number')}>Roll No{sortIcon('roll_number')}</th>
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('college')}>College{sortIcon('college')}</th>
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('city')}>City{sortIcon('city')}</th>
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('gps')}>GPS{sortIcon('gps')}</th>
                      <th className="pb-2 cursor-pointer hover:text-surface-200 select-none" onClick={() => toggleSort('status')}>Status{sortIcon('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecords.map(r => (
                      <tr key={r.record_id || r.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-2 font-medium">{r.student_name}</td>
                        <td className="text-surface-400">{r.roll_number || r.id}</td>
                        <td>{r.college_name || r.campus_name || '—'}</td>
                        <td>{r.city_name || '—'}</td>
                        <td>
                          {r.gps_validated ? (
                            <span className="text-emerald-400 text-xs font-semibold">✓ Verified</span>
                          ) : r.gps_latitude ? (
                            <span className="text-amber-400 text-xs" title={`${r.gps_latitude?.toFixed(4)}, ${r.gps_longitude?.toFixed(4)}`}>📍 {r.gps_latitude?.toFixed(2)}, {r.gps_longitude?.toFixed(2)}</span>
                          ) : (
                            <span className="text-surface-600 text-xs">—</span>
                          )}
                        </td>
                        <td><span className={statusBadge[r.final_attendance_status || r.status] || 'badge-absent'}>{r.final_attendance_status || r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Live Session" maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Subject</label>
              <input type="text" value={editForm.subject || ''} onChange={e => setEditForm({ ...editForm, subject: e.target.value })} className="input-field" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Access Key</label>
              <input type="text" value={editForm.access_key || ''} onChange={e => setEditForm({ ...editForm, access_key: e.target.value })} className="input-field" />
            </div>
            <MultiSelect label="Department" options={departments} selected={editForm.department || []}
              onChange={v => setEditForm({ ...editForm, department: v })} />
            <MultiSelect label="Section" options={sections} selected={editForm.section || []}
              onChange={v => setEditForm({ ...editForm, section: v })} />
            <div className="md:col-span-2">
              <MultiSelect label="College" options={colleges} selected={editForm.college || []}
                onChange={v => setEditForm({ ...editForm, college: v })} />
            </div>

            <hr className="md:col-span-2 border-white/10" />
            <p className="md:col-span-2 text-sm font-semibold text-surface-400">⏰ Time Windows (IST)</p>

            <div>
              <label className="block text-sm font-medium mb-1">Class Start Time</label>
              <input type="time" value={editForm.class_start_time || ''} onChange={e => setEditForm({ ...editForm, class_start_time: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Attendance Monitoring End</label>
              <input type="time" value={editForm.attendance_monitoring_end || ''} onChange={e => setEditForm({ ...editForm, attendance_monitoring_end: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Meeting End Time</label>
              <input type="time" value={editForm.meeting_end_time || ''} onChange={e => setEditForm({ ...editForm, meeting_end_time: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Verification Start</label>
              <input type="time" value={editForm.end_verification_start || ''} onChange={e => setEditForm({ ...editForm, end_verification_start: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Verification End</label>
              <input type="time" value={editForm.end_verification_end || ''} onChange={e => setEditForm({ ...editForm, end_verification_end: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Grace Period (mins)</label>
              <input type="number" value={editForm.grace_period || '0'} onChange={e => setEditForm({ ...editForm, grace_period: e.target.value })} className="input-field" min="0" />
            </div>
          </div>
          <button onClick={handleEditSave} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
