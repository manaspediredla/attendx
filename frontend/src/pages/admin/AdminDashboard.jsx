import { useState, useEffect } from 'react';
import api from '../../api/axios';
import DashboardCard from '../../components/common/DashboardCard';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/attendance/dashboard');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content">
        <div className="loading-spinner">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <h2 className="page-title">Admin Dashboard</h2>

      {/* Stats Cards */}
      <div className="dashboard-grid">
        <DashboardCard
          icon="👨‍🎓"
          title="Total Students"
          value={stats?.total_students || 0}
          color="blue"
        />
        <DashboardCard
          icon="✅"
          title="Present Today"
          value={stats?.monitored_today ? stats.present_today : '—'}
          subtitle={!stats?.monitored_today ? 'Not monitored yet' : stats?.has_active_session ? '🔴 Session in progress' : undefined}
          color="green"
        />
        <DashboardCard
          icon="❌"
          title="Absent Today"
          value={stats?.has_active_session && !stats?.absent_today ? '—' : stats?.monitored_today ? stats.absent_today : '—'}
          subtitle={!stats?.monitored_today ? 'Not monitored yet' : stats?.has_active_session && !stats?.absent_today ? 'Session in progress' : undefined}
          color="red"
        />
        <DashboardCard
          icon="📊"
          title="Today's Rate"
          value={stats?.monitored_today ? `${stats.attendance_percentage}%` : '—'}
          subtitle={!stats?.monitored_today ? 'Not monitored yet' : stats?.has_active_session ? '🔴 Session in progress' : undefined}
          color="purple"
        />
        <DashboardCard
          icon="⚠️"
          title="Below 75%"
          value={stats?.below_75_count || 0}
          subtitle="Students at risk"
          color="orange"
        />
      </div>

      {/* Charts Section */}
      <div className="dashboard-charts">
        {/* Monthly Trends */}
        <div className="chart-card">
          <h3 className="chart-card__title">📈 Monthly Attendance Trend</h3>
          <div className="chart-card__body">
            {stats?.monthly_trends?.length > 0 ? (
              <div className="bar-chart">
                {stats.monthly_trends.map((item, idx) => (
                  <div key={idx} className="bar-chart__item">
                    <div className="bar-chart__bar-wrapper">
                      <div
                        className="bar-chart__bar"
                        style={{ height: `${item.rate}%` }}
                      >
                        <span className="bar-chart__value">{item.rate}%</span>
                      </div>
                    </div>
                    <span className="bar-chart__label">{item.month}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="chart-card__empty">No data available yet</p>
            )}
          </div>
        </div>

        {/* Department-wise */}
        <div className="chart-card">
          <h3 className="chart-card__title">🏢 Department-wise Attendance</h3>
          <div className="chart-card__body">
            {stats?.department_wise?.length > 0 ? (
              <div className="dept-list">
                {stats.department_wise.map((dept, idx) => (
                  <div key={idx} className="dept-list__item">
                    <div className="dept-list__info">
                      <span className="dept-list__name">{dept.department}</span>
                      <span className="dept-list__count">{dept.students} students</span>
                    </div>
                    <div className="dept-list__progress">
                      <div className="progress-bar">
                        <div
                          className="progress-bar__fill"
                          style={{
                            width: `${dept.percentage}%`,
                            backgroundColor: dept.percentage >= 75 ? '#22c55e' : '#ef4444',
                          }}
                        ></div>
                      </div>
                      <span className="dept-list__percentage">{dept.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="chart-card__empty">No departments found</p>
            )}
          </div>
        </div>
      </div>

      {/* Most Absent Students */}
      <div className="chart-card">
        <h3 className="chart-card__title">🚨 Most Absent Students</h3>
        <div className="chart-card__body">
          {stats?.most_absent?.length > 0 ? (
            <div className="absent-list">
              {stats.most_absent.map((s, idx) => (
                <div key={idx} className="absent-list__item">
                  <div className="absent-list__rank">{idx + 1}</div>
                  <div className="absent-list__info">
                    <span className="absent-list__name">{s.name}</span>
                    <span className="absent-list__roll">{s.roll_number} • {s.department}</span>
                  </div>
                  <div className={`absent-list__percentage ${s.percentage < 50 ? 'text-danger' : 'text-warning'}`}>
                    {s.percentage}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="chart-card__empty">All students above 75% 🎉</p>
          )}
        </div>
      </div>
    </div>
  );
}
