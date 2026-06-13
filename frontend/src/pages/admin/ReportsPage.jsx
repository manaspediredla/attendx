import { useState } from 'react';
import api from '../../api/axios';
import { getAccessToken } from '../../utils/authStorage';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (startDate) params.append('date', startDate);

      const res = await api.get(`/reports/${reportType}?${params}`);
      setReportData(res.data.report);
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = (format) => {
    const params = new URLSearchParams({
      format,
      type: reportType,
    });
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const token = getAccessToken();
    window.open(
      `http://localhost:5001/api/reports/export?${params}`,
      '_blank'
    );
  };

  const totalRecords = reportData?.length || 0;
  const presentCount = reportData?.filter((r) => r.status === 'present').length || 0;
  const absentCount = totalRecords - presentCount;
  const rate = totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) : '0';

  return (
    <div className="page-content">
      <h2 className="page-title">Attendance Reports</h2>

      {/* Filters */}
      <div className="form-card">
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Report Type</label>
            <select className="form-input" value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="daily">Daily Report</option>
              <option value="weekly">Weekly Report</option>
              <option value="monthly">Monthly Report</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate}
              onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn--primary" onClick={fetchReport} disabled={loading}>
            {loading ? '⏳ Loading...' : '📊 Generate Report'}
          </button>
          <button className="btn btn--secondary" onClick={() => exportReport('csv')}>
            📥 Export CSV
          </button>
          <button className="btn btn--secondary" onClick={() => exportReport('pdf')}>
            📄 Export PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      {reportData && (
        <>
          <div className="report-summary">
            <div className="report-summary__card">
              <span className="report-summary__value">{totalRecords}</span>
              <span className="report-summary__label">Total Records</span>
            </div>
            <div className="report-summary__card report-summary__card--green">
              <span className="report-summary__value">{presentCount}</span>
              <span className="report-summary__label">Present</span>
            </div>
            <div className="report-summary__card report-summary__card--red">
              <span className="report-summary__value">{absentCount}</span>
              <span className="report-summary__label">Absent</span>
            </div>
            <div className="report-summary__card report-summary__card--blue">
              <span className="report-summary__value">{rate}%</span>
              <span className="report-summary__label">Rate</span>
            </div>
          </div>

          {/* Report Table */}
          <div className="data-table__container">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="data-table__th">Date</th>
                  <th className="data-table__th">Subject</th>
                  <th className="data-table__th">Roll No.</th>
                  <th className="data-table__th">Student</th>
                  <th className="data-table__th">Department</th>
                  <th className="data-table__th">Status</th>
                  <th className="data-table__th">Time</th>
                </tr>
              </thead>
              <tbody>
                {reportData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="data-table__empty">No records found</td>
                  </tr>
                ) : (
                  reportData.map((row, idx) => (
                    <tr key={idx} className="data-table__row">
                      <td className="data-table__td">{row.date}</td>
                      <td className="data-table__td">{row.subject}</td>
                      <td className="data-table__td">{row.roll_number}</td>
                      <td className="data-table__td">{row.student_name}</td>
                      <td className="data-table__td">{row.department}</td>
                      <td className="data-table__td">
                        <span className={`badge ${row.status === 'present' ? 'badge--success' : 'badge--danger'}`}>
                          {row.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="data-table__td">{row.marked_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
