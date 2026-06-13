/**
 * ATTENDX Brand Logo — Official brand icon with rounded corners
 */
export default function AttendXLogo({ size = 36, className = '' }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}attendx-logo.jpg`}
      alt="AttendX"
      draggable="false"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        objectFit: 'cover',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}

export function AttendXLogoText({ className = '', size = 'text-lg', variant = 'auto' }) {
  const textColor = variant === 'light'
    ? 'text-surface-100'
    : 'text-surface-900 dark:text-surface-100';
  const xColor = variant === 'light'
    ? 'text-surface-400'
    : 'text-surface-500 dark:text-surface-400';

  return (
    <span className={`font-extrabold tracking-tight ${size} ${className}`}>
      <span className={textColor} style={{ letterSpacing: '0.04em' }}>ATTEND</span>
      <span
        className={`${xColor} font-black`}
        style={{
          fontSize: '1.15em',
          letterSpacing: '0.02em',
          filter: 'drop-shadow(0 0 6px rgba(141,150,165,0.3))',
        }}
      >
        X
      </span>
    </span>
  );
}
