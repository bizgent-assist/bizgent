import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Inbox, Loader2, RotateCw, X, XCircle, ShieldAlert } from 'lucide-react';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

// ----------------------------------------------------------------- Button
const variants = {
  primary: 'bg-ink text-white hover:bg-ink-2 disabled:bg-ink/40',
  accent: 'bg-accent text-white hover:bg-accent-hover disabled:bg-accent/40',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-subtle disabled:text-faint',
  ghost: 'text-ink-2 hover:bg-subtle',
  danger: 'bg-bad text-white hover:bg-bad/90 disabled:bg-bad/40',
  'danger-ghost': 'text-bad hover:bg-bad-soft',
};
const sizes = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-[14px] gap-2', lg: 'h-12 px-5 text-[15px] gap-2' };

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, children, className, to, href, ...props }) {
  const cls = cx('inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed', variants[variant], sizes[size], className);
  const content = (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" strokeWidth={2} /> : null}
      {children}
    </>
  );
  if (to) return <Link to={to} className={cls} {...props}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...props}>{content}</a>;
  return <button type="button" className={cls} disabled={loading || props.disabled} {...props}>{content}</button>;
}

// ----------------------------------------------------------------- Card
export function Card({ title, subtitle, actions, children, className, padded = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="text-[14px] text-muted mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- Forms
export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={htmlFor} className="label">{label}</label>}
      {children}
      {error ? <p className="text-[12px] text-bad">{error}</p> : hint ? <p className="text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, hint, error, id, className, suffix, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <div className="relative">
        <input id={fid} className={cx('input', suffix && 'pr-16', error && 'border-bad focus:border-bad focus:ring-bad/10', className)} aria-invalid={Boolean(error)} {...props} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted">{suffix}</span>}
      </div>
    </Field>
  );
}

export function Select({ label, hint, error, id, options, placeholder, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <select id={fid} className={cx('input pr-8', error && 'border-bad')} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, id, ...props }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fid}>
      <textarea id={fid} className="input h-auto min-h-24 py-2.5" {...props} />
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex items-start justify-between gap-4 py-3', disabled && 'opacity-60')}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[13px] text-muted mt-0.5">{description}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

// ----------------------------------------------------------------- Status
const tones = {
  neutral: 'bg-subtle text-ink-2 border-line',
  ok: 'bg-ok-soft text-ok border-ok/20',
  warn: 'bg-warn-soft text-warn border-warn/20',
  bad: 'bg-bad-soft text-bad border-bad/20',
  info: 'bg-info-soft text-info border-info/20',
  accent: 'bg-accent-soft text-accent border-accent/20',
};
export function Badge({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon className="size-3.5" strokeWidth={2.25} />}
      {children}
    </span>
  );
}

const STATUS = {
  confirmed: ['ok', CheckCircle2, 'Confirmed'], completed: ['ok', CheckCircle2, 'Completed'], executed: ['ok', CheckCircle2, 'Executed'], paid: ['ok', CheckCircle2, 'Paid'], active: ['ok', CheckCircle2, 'Active'],
  pending: ['warn', Clock, 'Pending'], submitted: ['warn', Clock, 'Verifying'], executing: ['warn', Clock, 'Executing'], payment_pending: ['warn', Clock, 'Payment pending'], awaiting_approval: ['warn', Clock, 'Awaiting approval'], proposed: ['info', Clock, 'Proposed'],
  failed: ['bad', XCircle, 'Failed'], rejected: ['bad', XCircle, 'Rejected'], mismatch: ['bad', ShieldAlert, 'Mismatch'], invalidated: ['bad', ShieldAlert, 'Invalidated'], revoked: ['bad', XCircle, 'Revoked'],
  expired: ['neutral', Clock, 'Expired'], cancelled: ['neutral', XCircle, 'Cancelled'], unpaid: ['neutral', null, 'Unpaid'], suspended: ['warn', AlertTriangle, 'Suspended'], not_configured: ['neutral', null, 'Not configured'],
};
export function StatusBadge({ status }) {
  const [tone, icon, label] = STATUS[status] || ['neutral', null, status];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

// ----------------------------------------------------------------- States
export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function LoadingState({ label = 'Loading…', rows = 0 }) {
  if (rows) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label={label}>
        {Array.from({ length: rows }, (_, i) => <div key={i} className="h-11 rounded-lg bg-subtle animate-pulse" />)}
      </div>
    );
  }
  return <div className="flex items-center justify-center gap-2 py-12 text-[14px] text-muted" aria-busy="true"><Spinner /> {label}</div>;
}

export function ErrorState({ error, onRetry, title = 'Could not load this data', compact }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center', compact ? 'py-6' : 'py-12')}>
      <div className="size-10 rounded-full bg-bad-soft text-bad grid place-items-center mb-3"><AlertTriangle className="size-5" /></div>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      <p className="text-[13px] text-muted mt-1 max-w-md">{error?.message || 'Something went wrong.'}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RotateCw} className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      <div className="size-11 rounded-xl bg-subtle text-muted grid place-items-center mb-3"><Icon className="size-5" /></div>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description && <p className="text-[13px] text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Renders loading / error / empty / content for a useApi result. */
export function DataView({ state, empty, children, loadingRows = 4 }) {
  if (state.loading && !state.data) return <LoadingState rows={loadingRows} />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (empty && empty.when(state.data)) return <EmptyState {...empty} />;
  return children(state.data);
}

export function Alert({ tone = 'info', title, children, icon: Icon = AlertTriangle, action }) {
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5', tones[tone])}>
      <Icon className="size-4.5 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ----------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Runs only when `open` changes — re-running on every render would steal input focus.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={cx('relative w-full bg-surface sm:rounded-2xl rounded-t-2xl shadow-[var(--shadow-pop)] max-h-[92vh] flex flex-col outline-none', w)}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div>
            <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
            {description && <p className="text-[13px] text-muted mt-1">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 -m-1.5 rounded-lg text-muted hover:bg-subtle" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Table
export function Table({ columns, rows, rowKey = (r) => r._id, onRowClick, empty }) {
  if (!rows.length && empty) return <EmptyState {...empty} />;
  return (
    <div className="overflow-x-auto -mx-px">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('px-5 py-2.5 text-[12px] font-medium text-muted whitespace-nowrap', c.align === 'right' && 'text-right', c.className)}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas')}>
              {columns.map((c) => (
                <td key={c.key} className={cx('px-5 py-3 align-middle', c.align === 'right' && 'text-right', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------- Misc
export function Stat({ label, value, sub, icon: Icon, tone }) {
  return (
    <div className="card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {Icon && <span className={cx('size-8 rounded-lg grid place-items-center', tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-subtle text-ink-2')}><Icon className="size-4" /></span>}
      </div>
      <div className="mt-2 text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-ink tabular truncate">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted truncate">{sub}</div>}
    </div>
  );
}

export function KeyValue({ items }) {
  return (
    <dl className="divide-y divide-line">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2.5">
          <dt className="text-[13px] text-muted">{k}</dt>
          <dd className="text-[14px] text-ink sm:text-right min-w-0 break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line mb-4 -mx-1 px-1">
      {tabs.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)}
          className={cx('h-9 px-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors', value === t.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-subtle px-1.5 py-0.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
