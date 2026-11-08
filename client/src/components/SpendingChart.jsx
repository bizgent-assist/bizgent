import { useMemo, useState } from 'react';
import { fromBaseUnits } from '../utils/money.js';
import { formatDate } from '../utils/format.js';

const H = 168;
const PAD_TOP = 12;
const PAD_BOTTOM = 22;
const GAP = 2;

/** Daily verified spending (single series, one hue). Hover tooltip per bar; SR table fallback.
 *  Bar heights use Number only for geometry — all displayed values come from base units. */
export function SpendingChart({ series }) {
  const [hover, setHover] = useState(null);
  const [width, setWidth] = useState(640);
  const max = useMemo(() => series.reduce((m, p) => (BigInt(p.amount) > m ? BigInt(p.amount) : m), 0n), [series]);
  const n = series.length;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = width / n;
  const barW = Math.max(2, step - GAP);
  const scale = (v) => (max === 0n ? 0 : (Number(BigInt(v) * 10000n / max) / 10000) * plotH);

  const barPath = (x, h) => {
    if (h <= 0) return '';
    const r = Math.min(4, barW / 2, h);
    const y = PAD_TOP + plotH - h;
    const b = PAD_TOP + plotH;
    return `M${x},${b} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${b} Z`;
  };

  const ticks = [0, Math.floor(n / 2), n - 1];
  const hv = hover !== null ? series[hover] : null;

  return (
    <div className="relative" ref={(el) => { if (el && Math.abs(el.clientWidth - width) > 1) setWidth(el.clientWidth); }}>
      <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Daily verified spending, last 30 days" onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={width} y1={PAD_TOP} y2={PAD_TOP} stroke="var(--color-line)" strokeDasharray="3 4" />
        <line x1="0" x2={width} y1={PAD_TOP + plotH} y2={PAD_TOP + plotH} stroke="var(--color-line-strong)" />
        {series.map((p, i) => {
          const x = i * step + GAP / 2;
          const h = scale(p.amount);
          return (
            <g key={p.date}>
              {h > 0
                ? <path d={barPath(x, Math.max(h, 2))} fill="var(--color-accent)" opacity={hover === null || hover === i ? 1 : 0.45} />
                : <rect x={x} y={PAD_TOP + plotH - 1} width={barW} height="1" fill="var(--color-line-strong)" />}
              <rect x={i * step} y="0" width={step} height={H - PAD_BOTTOM} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        {ticks.map((i) => (
          <text key={i} x={i === 0 ? 0 : i === n - 1 ? width : i * step + step / 2} y={H - 6} fontSize="11" fill="var(--color-muted)" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {formatDate(series[i]?.date).replace(/, \d{4}$/, '')}
          </text>
        ))}
        <text x={width} y={PAD_TOP - 3} fontSize="11" fill="var(--color-muted)" textAnchor="end">{max > 0n ? `${fromBaseUnits(max.toString())} USDC` : ''}</text>
      </svg>
      {hv && (
        <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-[12px] text-white shadow-[var(--shadow-pop)] whitespace-nowrap"
          style={{ left: Math.min(Math.max(hover * step + step / 2, 60), width - 60) }}>
          <div className="text-white/60">{formatDate(hv.date)}</div>
          <div className="font-medium tabular">{fromBaseUnits(hv.amount)} USDC</div>
        </div>
      )}
      <table className="sr-only">
        <caption>Daily verified spending</caption>
        <thead><tr><th>Date</th><th>Amount (USDC)</th></tr></thead>
        <tbody>{series.map((p) => <tr key={p.date}><td>{p.date}</td><td>{fromBaseUnits(p.amount)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
