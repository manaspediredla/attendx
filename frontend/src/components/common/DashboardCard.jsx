export default function DashboardCard({ icon, title, value, subtitle, trend, color = 'blue' }) {
  return (
    <div className={`dashboard-card dashboard-card--${color}`}>
      <div className="dashboard-card__icon">{icon}</div>
      <div className="dashboard-card__content">
        <h3 className="dashboard-card__title">{title}</h3>
        <p className="dashboard-card__value">{value}</p>
        {subtitle && <span className="dashboard-card__subtitle">{subtitle}</span>}
        {trend !== undefined && (
          <span className={`dashboard-card__trend ${trend >= 0 ? 'trend--up' : 'trend--down'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
