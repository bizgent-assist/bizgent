// Integer base-unit money helpers. All authoritative amounts are strings of decimal
// digits representing token base units (e.g. USDC has 6 decimals: "1500000" = 1.5 USDC).
// Floating-point numbers are never used for money.

const BASE_UNITS_RE = /^(0|[1-9]\d{0,37})$/;

export function isBaseUnits(v) {
  return typeof v === 'string' && BASE_UNITS_RE.test(v);
}

/** Parses a human decimal string ("15", "15.5", "0.000001") into base units. Rejects
 * anything with more fractional digits than `decimals` instead of rounding. */
export function parseDecimal(input, decimals) {
  const s = String(input ?? '').trim().replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error('Amount must be a positive decimal number');
  const [, whole, frac = ''] = m;
  if (frac.length > decimals) throw new Error(`Amount has more than ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return units.toString();
}

/** Formats base units as a fixed decimal string (no currency symbol). */
export function formatUnits(units, decimals, minFraction = 2) {
  const v = BigInt(units);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString();
  let frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, '0');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

export function sumUnits(values) {
  return values.reduce((acc, v) => acc + BigInt(v || '0'), 0n).toString();
}

export function cmpUnits(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x === y ? 0 : x > y ? 1 : -1;
}
