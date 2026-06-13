import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import {
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  ShieldExclamationIcon,
  FunnelIcon,
  ChartBarIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

// ── Risk config ──────────────────────────────────────────────────

const RISK_CONFIG = {
  critical: {
    label: 'Critical',
    color: 'text-red-500',
    bg: 'bg-red-500/10 dark:bg-red-500/15',
    border: 'border-red-500/30',
    bar: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
  },
  high: {
    label: 'High Risk',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10 dark:bg-orange-500/15',
    border: 'border-orange-500/30',
    bar: 'bg-orange-500',
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dot: 'bg-orange-500',
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10 dark:bg-yellow-500/15',
    border: 'border-yellow-500/30',
    bar: 'bg-yellow-500',
    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    dot: 'bg-yellow-500',
  },
  safe: {
    label: 'Safe',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    border: 'border-emerald-500/30',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
};

// ── Trend icon helper ────────────────────────────────────────────

function TrendIcon({ trend }) {
  if (trend === 'improving')
    return <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-500" />;
  if (trend === 'declining')
    return <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />;
  return <MinusIcon className="w-4 h-4 text-surface-400" />;
}

// ── Mini progress bar ────────────────────────────────────────────

function ProgressBar({ pct, risk }) {
  const cfg = RISK_CONFIG[risk] || RISK_CONFIG.safe;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-bold min-w-[36px] text-right ${cfg.color}`}>
        {pct}%
      </span>
    </div>
  );
}

// ── Risk badge ───────────────────────────────────────────────────

function RiskBadge({ risk }) {
  const cfg = RISK_CONFIG[risk] || RISK_CONFIG.safe;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Risk distribution bar ────────────────────────────────────────

function RiskDistributionBar({ summary }) {
  const total = summary.total || 1;
  const segments = [
    { key: 'critical', count: summary.critical, color: 'bg-red-500' },
    { key: 'high', count: summary.high, color: 'bg-orange-500' },
    { key: 'medium', count: summary.medium, color: 'bg-yellow-500' },
    { key: 'safe', count: summary.safe, color: 'bg-emerald-500' },
  ];

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-surface-600 dark:text-surface-400 mb-3">Risk Distribution</h3>
      <div className="flex h-4 rounded-full overflow-hidden bg-surface-200 dark:bg-surface-700">
        {segments.map(seg => {
          const pct = (seg.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={seg.key}
              className={`${seg.color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${RISK_CONFIG[seg.key].label}: ${seg.count} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-3">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span className="text-[11px] text-surface-500">
              {RISK_CONFIG[seg.key].label}: {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function PredictiveAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);

  // Filters
  const [filterRisk, setFilterRisk] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Sort
  const [sortBy, setSortBy] = useState('risk');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    api.get('/teacher/analytics/subjects').then(r => setSubjects(r.data)).catch(() => {});
    fetchData();
  }, [filterSubject]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterSubject) params.subject = filterSubject;
      const res = await api.get('/teacher/analytics/predictions', { params });
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────

  const filteredPredictions = useMemo(() => {
    if (!data?.predictions) return [];
    let list = [...data.predictions];

    if (filterRisk) list = list.filter(p => p.risk_level === filterRisk);
    if (filterDept) list = list.filter(p => p.department === filterDept);
    if (filterSection) list = list.filter(p => p.section === filterSection);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.student_id.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'risk') {
        const order = { critical: 0, high: 1, medium: 2, safe: 3 };
        cmp = (order[a.risk_level] ?? 99) - (order[b.risk_level] ?? 99);
      } else if (sortBy === 'current_pct') {
        cmp = a.current_pct - b.current_pct;
      } else if (sortBy === 'predicted_pct') {
        cmp = a.predicted_pct - b.predicted_pct;
      } else if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === 'can_miss') {
        cmp = a.can_miss_more - b.can_miss_more;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [data, filterRisk, filterDept, filterSection, searchQuery, sortBy, sortDir]);

  const departments = useMemo(() => {
    if (!data?.predictions) return [];
    return [...new Set(data.predictions.map(p => p.department).filter(Boolean))].sort();
  }, [data]);

  const sections = useMemo(() => {
    if (!data?.predictions) return [];
    return [...new Set(data.predictions.map(p => p.section).filter(Boolean))].sort();
  }, [data]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ col, children }) => (
    <th
      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-surface-500 cursor-pointer hover:text-surface-900 dark:hover:text-surface-200 select-none transition-colors"
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortBy === col && (
          <span className="text-primary-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="spinner w-10 h-10" />
      </div>
    );
  }

  const summary = data?.summary || { critical: 0, high: 0, medium: 0, safe: 0, total: 0 };
  const totalSessions = data?.total_sessions || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-surface-900 dark:text-surface-100 flex items-center gap-2">
            <ChartBarIcon className="w-7 h-7 text-primary-500" />
            Predictive Analytics
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            AI-powered attendance risk forecasting · {totalSessions} session{totalSessions !== 1 ? 's' : ''} analyzed
          </p>
        </div>

        {/* Subject filter */}
        {subjects.length > 0 && (
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="input-field text-sm w-48"
          >
            <option value="">All Subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'critical', icon: ShieldExclamationIcon, label: 'Critical', subtitle: 'Below 60%' },
          { key: 'high', icon: ExclamationTriangleIcon, label: 'High Risk', subtitle: '60–70%' },
          { key: 'medium', icon: ExclamationTriangleIcon, label: 'Medium', subtitle: '70–75%' },
          { key: 'safe', icon: AcademicCapIcon, label: 'Safe', subtitle: 'Above 75%' },
        ].map((card, i) => {
          const cfg = RISK_CONFIG[card.key];
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={`glass-card p-5 border ${cfg.border} cursor-pointer transition-all ${filterRisk === card.key ? 'ring-2 ring-primary-500 scale-[1.02]' : 'hover:scale-[1.01]'}`}
              onClick={() => setFilterRisk(filterRisk === card.key ? '' : card.key)}
            >
              <div className="flex items-center justify-between mb-2">
                <card.icon className={`w-5 h-5 ${cfg.color}`} />
                <span className={`text-3xl font-black ${cfg.color}`}>
                  {summary[card.key]}
                </span>
              </div>
              <p className="text-sm font-bold text-surface-800 dark:text-surface-200">{card.label}</p>
              <p className="text-[11px] text-surface-500">{card.subtitle}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Distribution bar */}
      <RiskDistributionBar summary={summary} />

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FunnelIcon className="w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search name or roll no..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-field text-sm w-52"
          />
          <select
            value={filterDept}
            onChange={e => setFilterDept(e.target.value)}
            className="input-field text-sm w-40"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={filterSection}
            onChange={e => setFilterSection(e.target.value)}
            className="input-field text-sm w-32"
          >
            <option value="">All Sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterRisk}
            onChange={e => setFilterRisk(e.target.value)}
            className="input-field text-sm w-36"
          >
            <option value="">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium</option>
            <option value="safe">Safe</option>
          </select>
          {(filterRisk || filterDept || filterSection || searchQuery) && (
            <button
              onClick={() => { setFilterRisk(''); setFilterDept(''); setFilterSection(''); setSearchQuery(''); }}
              className="text-xs text-primary-500 hover:text-primary-400 font-semibold"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Student table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-700">
                <SortHeader col="name">Student</SortHeader>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-surface-500">Dept / Section</th>
                <SortHeader col="current_pct">Current %</SortHeader>
                <SortHeader col="predicted_pct">Predicted %</SortHeader>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-surface-500">Trend</th>
                <SortHeader col="risk">Risk Level</SortHeader>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-surface-500">Sessions</th>
                <SortHeader col="can_miss">Can Miss</SortHeader>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-surface-500">Streak</th>
              </tr>
            </thead>
            <tbody>
              {filteredPredictions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-12 text-center text-surface-400">
                    {totalSessions === 0
                      ? 'No completed sessions yet. Conduct sessions to see predictions.'
                      : 'No students match the current filters.'
                    }
                  </td>
                </tr>
              ) : (
                filteredPredictions.map((p, i) => {
                  const riskCfg = RISK_CONFIG[p.risk_level] || RISK_CONFIG.safe;
                  return (
                    <motion.tr
                      key={p.internal_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                    >
                      {/* Student */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">{p.name}</p>
                        <p className="text-[11px] text-surface-400">{p.student_id}</p>
                      </td>

                      {/* Dept / Section */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-surface-600 dark:text-surface-400">{p.department}</span>
                        <span className="text-[11px] text-surface-400 ml-1">· {p.section}</span>
                      </td>

                      {/* Current % */}
                      <td className="px-4 py-3">
                        <ProgressBar pct={p.current_pct} risk={p.risk_level} />
                      </td>

                      {/* Predicted % */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-bold ${riskCfg.color}`}>{p.predicted_pct}%</span>
                          <TrendIcon trend={p.trend} />
                        </div>
                      </td>

                      {/* Trend */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium capitalize ${
                          p.trend === 'improving' ? 'text-emerald-500' :
                          p.trend === 'declining' ? 'text-red-500' :
                          'text-surface-400'
                        }`}>
                          {p.trend}
                        </span>
                      </td>

                      {/* Risk Level */}
                      <td className="px-4 py-3">
                        <RiskBadge risk={p.risk_level} />
                      </td>

                      {/* Sessions */}
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                          {p.sessions_attended}/{p.total_sessions}
                        </span>
                      </td>

                      {/* Can Miss */}
                      <td className="px-4 py-3">
                        <span className={`text-sm font-bold ${
                          p.can_miss_more === 0 ? 'text-red-500' :
                          p.can_miss_more <= 2 ? 'text-orange-500' :
                          'text-surface-600 dark:text-surface-400'
                        }`}>
                          {p.can_miss_more}
                        </span>
                      </td>

                      {/* Streak */}
                      <td className="px-4 py-3">
                        {p.streak_count > 0 && (
                          <span className={`text-xs font-semibold ${
                            p.streak_type === 'present' ? 'text-emerald-500' : 'text-red-500'
                          }`}>
                            {p.streak_count}× {p.streak_type === 'present' ? '✓' : '✗'}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between">
          <span className="text-xs text-surface-400">
            Showing {filteredPredictions.length} of {summary.total} students
          </span>
          <span className="text-[10px] text-surface-400">
            Predictions based on linear trend analysis of recent attendance patterns
          </span>
        </div>
      </div>
    </motion.div>
  );
}
