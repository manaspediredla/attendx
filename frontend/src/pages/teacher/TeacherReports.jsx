import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { ChevronUpIcon, ChevronDownIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

const STATUS_STYLES = {
  active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  end_verification: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  completed: 'bg-surface-500/15 text-surface-700 dark:text-surface-400 border-surface-500/20',
};

const ATTENDANCE_BADGES = {
  full: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
  suspicious: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
  absent: 'bg-surface-500/15 text-surface-700 dark:text-surface-400 border-surface-500/20',
  present_start: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
  present_end: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
};

export default function TeacherReports() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Selected session & its records
  const [selectedSession, setSelectedSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  // Dropdown Filters
  const [collegeFilter, setCollegeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filter options from API
  const [colleges, setColleges] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    api.get('/teacher/colleges').then(r => setColleges(r.data || [])).catch(() => {});
    api.get('/teacher/locations').then(r => setLocations(r.data || [])).catch(() => {});
    api.get('/teacher/departments').then(r => setDepartments(r.data || [])).catch(() => {});
    api.get('/teacher/sections').then(r => setSections(r.data || [])).catch(() => {});
  }, []);

  // Fetch teacher's sessions
  useEffect(() => {
    if (!user) return;
    setLoadingSessions(true);
    const params = new URLSearchParams({ page, per_page: 15, teacher_id: user.id });
    api.get(`/attendance/sessions?${params}`)
      .then(r => {
        setSessions(r.data.sessions || []);
        setTotalPages(r.data.pages || 1);
      })
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoadingSessions(false));
  }, [user, page]);

  // When a session is selected, fetch its records
  const openSession = (session) => {
    setSelectedSession(session);
    setLoadingRecords(true);
    setSortField('');
    setCollegeFilter(''); setLocationFilter(''); setDeptFilter(''); setSectionFilter(''); setStatusFilter('');

    api.get(`/attendance/live/${session.id}?include_absent=true`)
      .then(r => setRecords(r.data.records || []))
      .catch(() => toast.error('Failed to load records'))
      .finally(() => setLoadingRecords(false));
  };

  const goBack = () => {
    setSelectedSession(null);
    setRecords([]);
  };

  const exportReport = async (format) => {
    try {
      const res = await api.get(
        `/reports/export?format=${format}&type=session&session_id=${selectedSession.id}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `session_${selectedSession.id}_report.${format}`;
      a.click();
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch {
      toast.error('Export failed');
    }
  };

  // Sorting
  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="opacity-30 ml-1 text-[10px]">⇅</span>;
    return sortDir === 'asc'
      ? <ChevronUpIcon className="w-3 h-3 ml-0.5 inline text-brand-400" />
      : <ChevronDownIcon className="w-3 h-3 ml-0.5 inline text-brand-400" />;
  };

  // Apply filters + sort
  const filteredRecords = records
    .filter(r => {
      if (collegeFilter && (r.college_name || r.campus_name) !== collegeFilter) return false;
      if (locationFilter && r.campus_name !== locationFilter) return false;
      if (deptFilter) {
        // student department - need to check from student data if available
        return true; // department filter is on session level
      }
      if (sectionFilter) return true; // section filter is on session level
      if (statusFilter && (r.final_attendance_status || r.status) !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      let aVal = '', bVal = '';
      if (sortField === 'student_name') { aVal = a.student_name || ''; bVal = b.student_name || ''; }
      else if (sortField === 'roll_number') { aVal = a.roll_number || a.id || ''; bVal = b.roll_number || b.id || ''; }
      else if (sortField === 'college') { aVal = a.college_name || a.campus_name || ''; bVal = b.college_name || b.campus_name || ''; }
      else if (sortField === 'location') { aVal = a.campus_name || ''; bVal = b.campus_name || ''; }
      else if (sortField === 'status') { aVal = a.final_attendance_status || a.status || ''; bVal = b.final_attendance_status || b.status || ''; }
      else if (sortField === 'gps') { aVal = a.gps_validated ? '1' : '0'; bVal = b.gps_validated ? '1' : '0'; }
      else { aVal = a[sortField] || ''; bVal = b[sortField] || ''; }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  // Get unique statuses from records
  const recordStatuses = [...new Set(records.map(r => r.final_attendance_status || r.status).filter(Boolean))];

  const clearFilters = () => {
    setCollegeFilter(''); setLocationFilter(''); setDeptFilter(''); setSectionFilter(''); setStatusFilter('');
  };
  const hasActiveFilters = collegeFilter || locationFilter || deptFilter || sectionFilter || statusFilter;

  const fmt = (dt) => dt ? dt.slice(11, 16) : '—';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
      <AnimatePresence mode="wait">
        {!selectedSession ? (
          /* ─── SESSION HISTORY LIST ─── */
          <motion.div key="sessions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 mb-6">📊 Session History & Reports</h1>

            {loadingSessions ? (
              <div className="flex justify-center py-20"><div className="spinner w-8 h-8" /></div>
            ) : sessions.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <p className="text-surface-500">No sessions found. Create a session from the Attendance tab first.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {sessions.map(s => (
                    <motion.div
                      key={s.id}
                      whileHover={{ scale: 1.005 }}
                      onClick={() => openSession(s)}
                      className="glass-card p-5 cursor-pointer hover:border-brand-500/30 transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-bold text-surface-800 dark:text-surface-100 text-lg">{s.subject}</h3>
                            <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${STATUS_STYLES[s.status] || STATUS_STYLES.completed}`}>
                              {s.status}
                            </span>
                          </div>
                          <p className="text-sm text-surface-600 dark:text-surface-400">
                            {s.section} · {s.department} · {s.college || s.campus || '—'}
                          </p>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="text-xs text-surface-600 dark:text-surface-400">Date</p>
                            <p className="font-semibold text-surface-800 dark:text-surface-200">{s.session_date}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-surface-600 dark:text-surface-400">Time</p>
                            <p className="font-mono text-surface-800 dark:text-surface-300">{fmt(s.attendance_window_start)}</p>
                          </div>
                          <div className="text-center min-w-[50px]">
                            <p className="text-xs text-surface-600 dark:text-surface-400">Present</p>
                            <p className="font-bold text-emerald-400">{(s.full_count || 0) + (s.partial_count || 0)}</p>
                          </div>
                          <div className="text-center min-w-[50px]">
                            <p className="text-xs text-surface-600 dark:text-surface-400">Absent</p>
                            <p className="font-bold text-red-400">{s.absent_count || 0}</p>
                          </div>
                          <div className="text-surface-600 dark:text-surface-400 text-lg">→</div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6">
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary btn-sm">
                      ← Previous
                    </button>
                    <span className="text-xs text-surface-500">Page {page} of {totalPages}</span>
                    <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary btn-sm">
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </motion.div>
        ) : (
          /* ─── SESSION DETAIL VIEW ─── */
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            {/* Back + Session Header */}
            <div className="flex items-center gap-4 mb-6">
              <button onClick={goBack} className="btn-icon w-10 h-10 !rounded-xl">
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-extrabold text-surface-800 dark:text-surface-100">
                  {selectedSession.subject}
                  <span className={`ml-3 inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border align-middle ${STATUS_STYLES[selectedSession.status] || STATUS_STYLES.completed}`}>
                    {selectedSession.status}
                  </span>
                </h1>
                <p className="text-sm text-surface-600 dark:text-surface-400 mt-0.5">
                  {selectedSession.session_date} · {selectedSession.section} · {selectedSession.department} · {selectedSession.college || selectedSession.campus || '—'}
                </p>
              </div>
              <button onClick={() => exportReport('csv')} className="btn-secondary text-sm">📥 CSV</button>
              <button onClick={() => exportReport('pdf')} className="btn-secondary text-sm">📄 PDF</button>
            </div>

            {/* Session Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-surface-600 dark:text-surface-400 mb-1">Total</p>
                <p className="text-2xl font-black text-surface-800 dark:text-surface-200">{selectedSession.total_count || 0}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-surface-600 dark:text-surface-400 mb-1">Full</p>
                <p className="text-2xl font-black text-emerald-400">{selectedSession.full_count || 0}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-surface-600 dark:text-surface-400 mb-1">Partial</p>
                <p className="text-2xl font-black text-amber-400">{selectedSession.partial_count || 0}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-surface-600 dark:text-surface-400 mb-1">Suspicious</p>
                <p className="text-2xl font-black text-red-400">{selectedSession.suspicious_count || 0}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-surface-600 dark:text-surface-400 mb-1">Absent</p>
                <p className="text-2xl font-black text-surface-600 dark:text-surface-400">{selectedSession.absent_count || 0}</p>
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="glass-card p-4 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-surface-700 dark:text-surface-400">Filter:</span>

                <select value={collegeFilter} onChange={e => setCollegeFilter(e.target.value)} className="input-field text-sm !w-auto min-w-[160px]">
                  <option value="">All Colleges</option>
                  {colleges.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="input-field text-sm !w-auto min-w-[160px]">
                  <option value="">All Locations</option>
                  {locations.map(l => <option key={l.id} value={l.name}>{l.label}</option>)}
                </select>

                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field text-sm !w-auto min-w-[130px]">
                  <option value="">All Statuses</option>
                  <option value="full">Full</option>
                  <option value="partial">Partial</option>
                  <option value="absent">Absent</option>
                </select>

                {hasActiveFilters && (
                  <button onClick={clearFilters} className="text-xs text-red-400 hover:text-red-300 font-semibold">
                    ✕ Clear
                  </button>
                )}

                <span className="ml-auto text-xs text-surface-600 dark:text-surface-400">
                  {filteredRecords.length === records.length
                    ? `${records.length} records`
                    : `${filteredRecords.length} of ${records.length}`}
                </span>
              </div>
            </div>

            {/* Records Table */}
            <div className="glass-card overflow-hidden">
              {loadingRecords ? (
                <div className="flex justify-center py-12"><div className="spinner w-6 h-6" /></div>
              ) : filteredRecords.length === 0 ? (
                <p className="p-8 text-center text-surface-500">No records found</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-surface-300 dark:border-white/10">
                        {[
                          { key: 'student_name', label: 'Student Name' },
                          { key: 'roll_number', label: 'Roll No' },
                          { key: 'college', label: 'College' },
                          { key: 'location', label: 'Location' },
                          { key: 'gps', label: 'GPS' },
                          { key: 'status', label: 'Status' },
                        ].map(col => (
                          <th key={col.key}
                            onClick={() => toggleSort(col.key)}
                            className="px-4 py-3 text-xs font-semibold text-surface-600 dark:text-surface-400 uppercase tracking-wider cursor-pointer hover:text-surface-800 dark:hover:text-surface-200 select-none whitespace-nowrap transition-colors">
                            {col.label}
                            <SortIcon field={col.key} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map(r => {
                        const st = r.final_attendance_status || r.status;
                        return (
                          <tr key={r.record_id || r.student_id} className="border-b border-surface-200 dark:border-white/5 hover:bg-surface-300/50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-surface-800 dark:text-surface-100">{r.student_name}</td>
                            <td className="px-4 py-2.5 text-surface-600 dark:text-surface-400 font-mono text-xs">{r.roll_number || r.id}</td>
                            <td className="px-4 py-2.5 text-surface-700 dark:text-surface-300">{r.college_name || r.campus_name || '—'}</td>
                            <td className="px-4 py-2.5 text-surface-700 dark:text-surface-300">{r.campus_name || '—'}</td>
                            <td className="px-4 py-2.5">
                              {r.gps_validated ? (
                                <span className="text-emerald-400 text-xs font-semibold">✓ Verified</span>
                              ) : r.gps_latitude ? (
                                <span className="text-amber-400 text-xs" title={`${r.gps_latitude?.toFixed(4)}, ${r.gps_longitude?.toFixed(4)}`}>
                                  📍 {r.gps_latitude?.toFixed(2)}, {r.gps_longitude?.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-surface-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold border ${ATTENDANCE_BADGES[st] || ATTENDANCE_BADGES.absent}`}>
                                {st || '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
