import { Link } from 'react-router-dom';

export function LogoMark({ className = 'size-7', invert = false }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={invert ? '#fff' : '#0E1726'} />
      <path d="M10 7h4v6.2a6 6 0 1 1-4 5.7V7zm4 11.9a2.1 2.1 0 1 0 4.2 0 2.1 2.1 0 0 0-4.2 0z" fill={invert ? '#0E1726' : '#fff'} />
      <circle cx="23" cy="9" r="2.5" fill="#34C38F" />
    </svg>
  );
}

export function Wordmark({ to = '/', invert = false }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 select-none" aria-label="Bizgent home">
      <LogoMark invert={invert} />
      <span className={`text-[19px] font-semibold tracking-[-0.035em] ${invert ? 'text-white' : 'text-ink'}`}>
        bizgent
      </span>
    </Link>
  );
}
