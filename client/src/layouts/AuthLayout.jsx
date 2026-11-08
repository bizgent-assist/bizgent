import { Outlet } from 'react-router-dom';
import { Lock, ShieldCheck, Vault } from 'lucide-react';
import { Wordmark } from '../components/Brand.jsx';
import { EnvironmentBanner } from '../components/NetworkBadge.jsx';

export default function AuthLayout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <EnvironmentBanner />
      <div className="flex-1 grid lg:grid-cols-[1fr_minmax(0,560px)]">
        <div className="hidden lg:flex flex-col justify-between bg-ink text-white p-12 relative overflow-hidden">
          <Wordmark invert />
          <div className="max-w-md">
            <h2 className="text-[30px] leading-tight font-semibold tracking-[-0.025em]">Your business. Powered by intelligence.</h2>
            <p className="mt-4 text-[15px] text-white/70 leading-relaxed">An AI agent that handles routine payments inside limits you set — enforced by a smart contract, with your wallet signature required for everything else.</p>
            <ul className="mt-8 space-y-3 text-[14px] text-white/85">
              <li className="flex gap-3"><Vault className="size-5 text-accent-bright shrink-0" />Native USDC treasury in an isolated on-chain vault</li>
              <li className="flex gap-3"><ShieldCheck className="size-5 text-accent-bright shrink-0" />Per-transaction and daily limits enforced by contract</li>
              <li className="flex gap-3"><Lock className="size-5 text-accent-bright shrink-0" />The AI never holds a key that can move money freely</li>
            </ul>
          </div>
          <p className="text-[12px] text-white/40">Experimental software on NEAR. Unaudited contract.</p>
          <div className="absolute -right-24 -bottom-24 size-96 rounded-full border border-white/5" />
          <div className="absolute -right-8 -bottom-8 size-64 rounded-full border border-white/5" />
        </div>
        <div className="flex flex-col px-5 sm:px-10 py-8">
          <div className="lg:hidden mb-10"><Wordmark /></div>
          <div className="flex-1 flex items-center">
            <div className="w-full max-w-sm mx-auto"><Outlet /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
