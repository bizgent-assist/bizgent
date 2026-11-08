import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight, Bot, Building2, ChevronDown, CircleUser, FileText, LayoutDashboard, LogOut, Menu, ShieldCheck, Sparkles, Users, Vault, Wallet, X,
} from 'lucide-react';
import { Wordmark } from '../components/Brand.jsx';
import { EnvironmentBanner, NetworkBadge } from '../components/NetworkBadge.jsx';
import { cx } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import { shortAccount } from '../utils/format.js';

const NAV = [
  { section: 'Overview', items: [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/assistant', label: 'AI assistant', icon: Sparkles },
  ] },
  { section: 'Money', items: [
    { to: '/app/treasury', label: 'Treasury', icon: Vault },
    { to: '/app/expenses', label: 'Expenses', icon: FileText },
    { to: '/app/approvals', label: 'Approvals', icon: ShieldCheck },
    { to: '/app/transactions', label: 'Transactions', icon: ArrowLeftRight },
  ] },
  { section: 'Controls', items: [
    { to: '/app/recipients', label: 'Recipients', icon: Users },
    { to: '/app/agent', label: 'Agent & policy', icon: Bot },
    { to: '/app/settings/business', label: 'Business', icon: Building2 },
  ] },
];

function Sidebar({ onNavigate }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      {NAV.map((g) => (
        <div key={g.section}>
          <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.section}</div>
          <ul className="space-y-0.5">
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} onClick={onNavigate}
                  className={({ isActive }) => cx('flex items-center gap-2.5 h-9 px-3 rounded-lg text-[14px] font-medium transition-colors', isActive ? 'bg-ink text-white' : 'text-ink-2 hover:bg-subtle')}>
                  <Icon className="size-4" strokeWidth={2} />{label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-subtle" aria-haspopup="menu" aria-expanded={open}>
        <span className="size-7 rounded-full bg-ink text-white grid place-items-center text-[12px] font-semibold">{user?.name?.[0]?.toUpperCase()}</span>
        <span className="hidden md:block text-[13px] font-medium text-ink max-w-32 truncate">{user?.name}</span>
        <ChevronDown className="size-4 text-muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 mt-1.5 w-60 z-40 card shadow-[var(--shadow-pop)] p-1.5">
            <div className="px-3 py-2 border-b border-line mb-1">
              <div className="text-[13px] font-medium text-ink truncate">{user?.name}</div>
              <div className="text-[12px] text-muted truncate">{user?.email}</div>
            </div>
            <NavLink to="/app/settings/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 h-9 rounded-md text-[13px] text-ink-2 hover:bg-subtle"><CircleUser className="size-4" />Profile & wallet</NavLink>
            <button type="button" onClick={logout} className="w-full flex items-center gap-2 px-3 h-9 rounded-md text-[13px] text-bad hover:bg-bad-soft"><LogOut className="size-4" />Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}

function WalletChip() {
  const { user } = useAuth();
  const wallet = useWallet();
  const linked = user?.nearAccountId;
  return (
    <NavLink to="/app/settings/profile" className={cx('hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-medium', linked ? 'border-line text-ink-2 hover:bg-subtle' : 'border-warn/30 bg-warn-soft text-warn')}>
      <Wallet className="size-3.5" />
      {linked ? shortAccount(linked) : 'Link wallet'}
      {linked && wallet.accountId && wallet.accountId !== linked && <span className="text-bad" title="Connected wallet differs from linked wallet">•</span>}
    </NavLink>
  );
}

export default function AppLayout() {
  const { business } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMobileOpen(false);
    document.getElementById('app-scroll')?.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <EnvironmentBanner />
      <div className="flex-1 flex min-h-0">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-line bg-surface h-full">
          <div className="h-16 flex items-center px-5 border-b border-line"><Wordmark to="/app" /></div>
          <Sidebar />
          <div className="p-4 border-t border-line">
            <div className="eyebrow mb-1">Business</div>
            <div className="text-[13px] font-medium text-ink truncate">{business?.name}</div>
            <div className="text-[12px] text-muted font-mono truncate">{business?.onchainId}</div>
          </div>
        </aside>

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative w-72 max-w-[85vw] bg-surface flex flex-col shadow-[var(--shadow-pop)]">
              <div className="h-16 flex items-center justify-between px-5 border-b border-line">
                <Wordmark to="/app" />
                <button type="button" onClick={() => setMobileOpen(false)} className="p-2 -mr-2 rounded-lg hover:bg-subtle" aria-label="Close menu"><X className="size-5" /></button>
              </div>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto" id="app-scroll">
          <header className="h-16 shrink-0 sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-6">
            <button type="button" className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-subtle" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <div className="lg:hidden"><Wordmark to="/app" /></div>
            <div className="hidden lg:block text-[14px] font-medium text-ink truncate">{business?.name}</div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <NetworkBadge />
              <WalletChip />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1280px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
