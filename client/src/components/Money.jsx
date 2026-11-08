import { fromBaseUnits } from '../utils/money.js';
import { cx } from './ui/index.jsx';

/**
 * The ONLY component that renders money. `kind="token"` shows the token denomination
 * (1,250.00 USDC); `kind="usd"` shows an accounting/reporting value ($1,250.00 USD).
 * `units` must be an integer base-unit string. Missing values render a dash — never 0.
 */
export function Money({ units, kind = 'token', className, muted }) {
  if (units === null || units === undefined || units === '') return <span className={cx('text-muted', className)}>—</span>;
  const value = fromBaseUnits(units);
  return (
    <span className={cx('tabular whitespace-nowrap', className)}>
      {kind === 'usd' ? `$${value}` : value}
      <span className={cx('ml-1 text-[0.8em] font-medium', muted !== false && 'text-muted')}>{kind === 'usd' ? 'USD' : 'USDC'}</span>
    </span>
  );
}
