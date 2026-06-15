import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import {
  PencilSquareIcon, ChevronDownIcon, CheckIcon,
  UserGroupIcon, CheckCircleIcon, XCircleIcon, ClockIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

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

/* ── Animated counter ── */
function AnimatedCount({ value, className = '' }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const steps = Math.min(Math.abs(diff), 20);
    const step = diff / steps;
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplay(Math.round(start + step * i));
      if (i >= steps) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [value]);
  return <span className={className}>{display}</span>;
}

/* ── SVG Progress Ring ── */
function ProgressRing({ percent, size = 100, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(percent, 100) / 100) * circ;
  const color = percent >= 75 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-surface-700/40" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-700 ease-out" />
    </svg>
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

  // Live feed: track newly arrived students
  const [liveFeed, setLiveFeed] = useState([]);
  const prevRecordIdsRef = useRef(new Set());
  const [lastRefresh, setLastRefresh] = useState(null);

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
      const records = r.data.records || [];
      setLiveRecords(records);
      if (r.data.session) setActiveSession(r.data.session);
      setLastRefresh(new Date());

      // Detect newly arrived students for live feed
      const currentIds = new Set(records.map(rec => rec.record_id || rec.id));
      const newEntries = records.filter(rec => {
        const rid = rec.record_id || rec.id;
        return !prevRecordIdsRef.current.has(rid);
      });
      if (prevRecordIdsRef.current.size > 0 && newEntries.length > 0) {
        setLiveFeed(prev => [
          ...newEntries.map(e => ({ ...e, _feedTime: Date.now() })),
          ...prev,
        ].slice(0, 10));
      }
      prevRecordIdsRef.current = currentIds;
    }).catch(() => {});
  };

  useEffect(() => {
    if (!activeSession) return;
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, filters]);

  // Computed stats
  const stats = useMemo(() => {
    const total = liveRecords.length;
    const present = liveRecords.filter(r => ['full', 'partial', 'present_start', 'present_end'].includes(r.final_attendance_status || r.status)).length;
    const absent = liveRecords.filter(r => (r.final_attendance_status || r.status) === 'absent').length;
    const expected = activeSession?.expected_count || total || 1;
    const pct = total > 0 ? Math.round((present / Math.max(expected, total)) * 100) : 0;
    return { total, present, absent, expected, pct };
  }, [liveRecords, activeSession]);

  // Phase detection
  const currentPhase = activeSession?.phase || activeSession?.status || 'scheduled';
  const phases = [
    { key: 'start_window', label: 'Start Check-in', icon: '📋' },
    { key: 'class_in_progress', label: 'Class Active', icon: '📖' },
    { key: 'end_window', label: 'End Verification', icon: '✅' },
    { key: 'completed', label: 'Completed', icon: '🏁' },
  ];
  const phaseIdx = phases.findIndex(p => p.key === currentPhase);

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
          {/* ── Session Header with Live Indicator ── */}
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                    Session #{activeSession.id} — {activeSession.subject}
                  </h2>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <p className="text-sm text-surface-500 mt-1">
                  Section: {displayMulti(activeSession.section)} · Dept: {displayMulti(activeSession.department)} · {displayMulti(activeSession.college || activeSession.campus)}
                </p>
                {activeSession.access_key && (
                  <div className="mt-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 inline-block">
                    <p className="text-xs text-amber-400/80 mb-0.5">Access Key</p>
                    <p className="text-lg font-bold tracking-wider text-amber-400">{activeSession.access_key}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={openEditModal} className="btn-secondary">
                  <PencilSquareIcon className="w-4 h-4" /> Edit
                </button>
                <button onClick={endSession} className="btn-danger">End Session</button>
              </div>
            </div>

            {/* ── Phase Timeline ── */}
            <div className="mt-5 flex items-center gap-0">
              {phases.map((p, i) => {
                const isActive = i === phaseIdx;
                const isDone = i < phaseIdx;
                return (
                  <div key={p.key} className="flex items-center flex-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      isActive ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40 scale-105' :
                      isDone ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-surface-700/30 text-surface-500'
                    }`}>
                      <span>{p.icon}</span>
                      <span className="hidden md:inline">{p.label}</span>
                    </div>
                    {i < phases.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 rounded-full transition-colors ${
                        isDone ? 'bg-emerald-500/40' : 'bg-surface-700/40'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Stats Cards + Progress Ring ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Progress Ring */}
            <div className="glass-card p-5 flex flex-col items-center justify-center col-span-2 lg:col-span-1">
              <div className="relative">
                <ProgressRing percent={stats.pct} size={90} stroke={7} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-black text-surface-100 rotate-90">{stats.pct}%</span>
                </div>
              </div>
              <p className="text-xs text-surface-500 mt-2">Completion</p>
            </div>

            {/* Stat cards */}
            {[
              { label: 'Total Records', value: stats.total, icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
              { label: 'Present', value: stats.present, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Absent', value: stats.absent, icon: XCircleIcon, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
              { label: 'Last Refresh', value: null, icon: ClockIcon, color: 'text-surface-400', bg: 'bg-surface-500/10 border-surface-500/20' },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass-card p-4 border ${card.bg}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                  {card.value !== null ? (
                    <AnimatedCount value={card.value} className={`text-2xl font-black ${card.color}`} />
                  ) : (
                    <span className="text-sm font-medium text-surface-400">
                      {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-500 font-medium">{card.label}</p>
              </motion.div>
            ))}
          </div>

          {/* ── Live Feed + Table side by side ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* Live Feed Panel */}
            <div className="glass-card p-4 lg:col-span-1 max-h-[500px] overflow-y-auto">
              <div className="flex items-center gap-2 mb-3">
                <SignalIcon className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-surface-200">Live Feed</h3>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              {liveFeed.length === 0 ? (
                <p className="text-xs text-surface-500 py-4 text-center">Waiting for students to check in...</p>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {liveFeed.map((entry, i) => (
                      <motion.div
                        key={entry._feedTime + '-' + (entry.record_id || entry.id)}
                        initial={{ opacity: 0, x: -20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center text-xs font-bold text-primary-400">
                          {(entry.student_name || '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-surface-200 truncate">{entry.student_name}</p>
                          <p className="text-[10px] text-surface-500">{entry.roll_number || entry.id}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusBadge[entry.final_attendance_status || entry.status] || 'badge-absent'}`}>
                          {(entry.final_attendance_status || entry.status || '').replace('_', ' ')}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Main Table */}
            <div className="lg:col-span-3 space-y-4">
              {/* Filters */}
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

              {/* Table */}
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
                        <AnimatePresence mode="popLayout">
                          {sortedRecords.map(r => (
                            <motion.tr
                              key={r.record_id || r.id}
                              initial={{ opacity: 0, backgroundColor: 'rgba(99,102,241,0.1)' }}
                              animate={{ opacity: 1, backgroundColor: 'transparent' }}
                              transition={{ duration: 0.5 }}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
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
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
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
