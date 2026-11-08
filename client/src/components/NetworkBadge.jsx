import { FlaskConical, Globe, ShieldAlert } from 'lucide-react';
import { useConfig } from '../context/ConfigContext.jsx';
import { cx } from './ui/index.jsx';

export function NetworkBadge({ className }) {
  const cfg = useConfig();
  const testnet = cfg.network !== 'mainnet';
  if (cfg.mismatches?.length) {
    return <span className={cx('inline-flex items-center gap-1.5 rounded-md bg-bad text-white px-2 py-1 text-[11px] font-semibold tracking-wide', className)}><ShieldAlert className="size-3.5" />NETWORK MISMATCH</span>;
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide', testnet ? 'bg-warn-soft text-warn border border-warn/25' : 'bg-ok-soft text-ok border border-ok/25', className)}
      title={testnet ? 'NEAR testnet — test tokens only, no real funds' : 'NEAR mainnet — real funds'}>
      {testnet ? <FlaskConical className="size-3.5" /> : <Globe className="size-3.5" />}
      {cfg.demo ? 'DEMO DATA' : testnet ? 'TESTNET' : 'MAINNET'}
    </span>
  );
}

/** Thin page-wide notice for demo mode, testnet, or configuration problems. */
export function EnvironmentBanner() {
  const cfg = useConfig();
  if (cfg.demo) {
    return <div className="bg-info text-white text-center text-[12px] font-medium py-1.5 px-4">Demo mode — all data shown is fabricated sample data. Nothing here is real.</div>;
  }
  if (cfg.mismatches?.length) {
    return <div className="bg-bad text-white text-center text-[12px] font-medium py-1.5 px-4">Configuration mismatch ({cfg.mismatches.join(', ')}). Financial actions are disabled.</div>;
  }
  if (cfg.network !== 'mainnet') {
    return <div className="bg-[#1d2939] text-[#fec84b] text-center text-[12px] font-medium py-1.5 px-4">NEAR TESTNET — test USDC only. Balances and payments have no real-world value.</div>;
  }
  return null;
}
