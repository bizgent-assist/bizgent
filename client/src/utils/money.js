// Integer base-unit money utilities (BigInt). The API exchanges amounts as base-unit strings.
// Never use floating-point numbers for money.
export const USDC_DECIMALS = 6;

/** "15.5" -> "15500000". Throws on invalid input or too many decimals (never rounds). */
export function toBaseUnits(input, decimals = USDC_DECIMALS) {
  const s = String(input ?? '').trim().replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error('Enter a valid amount');
  const [, whole, frac = ''] = m;
  if (frac.length > decimals) throw new Error(`Maximum ${decimals} decimal places`);
  return (BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac || '').padEnd(decimals, '0') || '0')).toString();
}

/** "15500000" -> "15.50" (grouped). Keeps every significant digit; pads to 2 decimals. */
export function fromBaseUnits(units, decimals = USDC_DECIMALS, { group = true, minFraction = 2 } = {}) {
  if (units === null || units === undefined || units === '') return '';
  const v = BigInt(units);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  let whole = (abs / base).toString();
  let frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, '0');
  if (group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Token amount: always labelled with the asset. "1,250.00 USDC" */
export const formatUSDC = (units) => `${fromBaseUnits(units)} USDC`;
/** Accounting/reporting value in USD (explicitly labelled). "$1,250.00 USD" */
export const formatUSD = (units) => `$${fromBaseUnits(units)} USD`;

export function addUnits(...values) {
  return values.reduce((a, v) => a + BigInt(v || '0'), 0n).toString();
}

export function isValidAmountInput(s) {
  try { return BigInt(toBaseUnits(s)) > 0n; } catch { return false; }
}
