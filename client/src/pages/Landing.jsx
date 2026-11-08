import { ArrowRight, Bot, CheckCircle2, FileText, KeyRound, Lock, MessageSquareText, ScanSearch, ShieldCheck, Sparkles, Vault, XCircle } from 'lucide-react';
import { Wordmark } from '../components/Brand.jsx';
import { NetworkBadge } from '../components/NetworkBadge.jsx';
import { Button } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const steps = [
  { icon: MessageSquareText, title: 'Ask in plain language', body: '“Pay our design tool subscription.” The assistant finds the expense, the supplier and the amount.' },
  { icon: ScanSearch, title: 'Policy decides — not the AI', body: 'A deterministic policy engine checks limits, the approved-recipient list and the live vault balance.' },
  { icon: KeyRound, title: 'Contract enforces', body: 'Within limits, a restricted agent key pays. Anything else waits for your own wallet signature.' },
  { icon: CheckCircle2, title: 'Verified on-chain', body: 'Payments are marked complete only after Bizgent reads the actual NEAR transaction outcome.' },
];

const benefits = [
  { icon: Bot, title: 'Routine payments on autopilot', body: 'Subscriptions and regular suppliers get paid inside the budget you set — no chasing, no late fees.' },
  { icon: Vault, title: 'A treasury in native USDC', body: 'Each business has an isolated vault balance on NEAR. Deposit and withdraw with your own wallet.' },
  { icon: FileText, title: 'Expenses with context', body: 'Track what is due, what is paid and what is pending, with every payment linked to its transaction.' },
  { icon: Sparkles, title: 'Answers, not spreadsheets', body: '“How much did we spend on software this month?” The assistant reads verified records and explains.' },
];

function HeroPanel() {
  return (
    <div className="card p-5 shadow-[var(--shadow-pop)] max-w-md w-full mx-auto" aria-label="Product illustration">
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow">Illustration</span>
        <span className="text-[11px] font-medium text-muted">Assistant</span>
      </div>
      <div className="space-y-3 text-[13px]">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink text-white px-3.5 py-2.5">Pay the design tool subscription.</div>
        <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-subtle px-3.5 py-2.5 text-ink-2">Found “Design tool subscription” — 15.00 USDC to an approved recipient. Within your agent limits.</div>
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between"><span className="font-medium">15.00 USDC</span><span className="inline-flex items-center gap-1 text-ok text-[12px] font-medium"><CheckCircle2 className="size-3.5" />Verified on-chain</span></div>
          <div className="mt-1 text-[12px] text-muted">Agent payment · within 20.00 USDC limit</div>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="flex items-center justify-between"><span className="font-medium">120.00 USDC</span><span className="inline-flex items-center gap-1 text-warn text-[12px] font-medium"><KeyRound className="size-3.5" />Needs your signature</span></div>
          <div className="mt-1 text-[12px] text-muted">New recipient · above per-transaction limit</div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { status } = useAuth();
  const authed = status === 'authenticated';
  return (
    <div className="bg-surface">
      <header className="sticky top-0 z-30 bg-surface/85 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-4">
          <Wordmark />
          <nav className="hidden md:flex items-center gap-6 ml-8 text-[14px] text-ink-2">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#security" className="hover:text-ink">Security</a>
            <a href="#benefits" className="hover:text-ink">Benefits</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NetworkBadge className="hidden sm:inline-flex" />
            {authed ? <Button to="/app" size="sm">Open dashboard</Button> : (
              <>
                <Button to="/login" variant="ghost" size="sm">Sign in</Button>
                <Button to="/register" size="sm">Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-16 pb-20 sm:pt-24 grid lg:grid-cols-[1.1fr_1fr] gap-14 items-center">
        <div>
          <p className="eyebrow text-accent">Autonomous business finance on NEAR</p>
          <h1 className="mt-4 text-[38px] sm:text-[52px] leading-[1.05] font-semibold tracking-[-0.035em] text-ink">Your business.<br />Powered by intelligence.</h1>
          <p className="mt-5 text-[17px] text-ink-2 leading-relaxed max-w-xl">Bizgent is an AI finance agent that plans expenses, manages a USDC treasury and pays routine bills — within limits a smart contract enforces. Your money stays under your control.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to={authed ? '/app' : '/register'} size="lg" icon={ArrowRight}>{authed ? 'Open dashboard' : 'Create a workspace'}</Button>
            <Button href="#security" variant="secondary" size="lg">See the security model</Button>
          </div>
          <p className="mt-5 text-[12px] text-muted">Running on NEAR testnet with test USDC. Experimental, unaudited software.</p>
        </div>
        <HeroPanel />
      </section>

      <section className="border-y border-line bg-canvas">
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">Small businesses spend hours on payments that should run themselves.</h2>
          </div>
          <ul className="space-y-4 text-[15px] text-ink-2">
            {['Recurring bills, supplier invoices and subscriptions are tracked by hand.', 'Delegating payments means sharing passwords or giving someone full access to the account.', 'AI tools that “handle money” usually ask for unrestricted control — an unacceptable risk.'].map((t) => (
              <li key={t} className="flex gap-3"><XCircle className="size-5 text-bad shrink-0 mt-0.5" />{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="how" className="max-w-6xl mx-auto px-5 py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.025em] max-w-2xl">The AI proposes. Policy decides. The contract enforces. You stay in control.</h2>
        <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="size-9 rounded-lg bg-accent-soft text-accent grid place-items-center"><Icon className="size-4.5" /></span>
                <span className="text-[12px] font-mono text-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-[14px] text-muted leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="security" className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-5 py-20 grid lg:grid-cols-2 gap-12">
          <div>
            <p className="eyebrow text-accent-bright">Security model</p>
            <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">The AI can make decisions within granted permissions — it never has unrestricted control of funds.</h2>
            <p className="mt-4 text-[15px] text-white/70 leading-relaxed">Limits live in the vault contract, not in a prompt. Even if the AI or the server were compromised, the agent could only pay approved recipients up to your daily limit — and you can revoke it instantly.</p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-4">
            {[
              [Lock, 'Restricted agent key', 'A function-call key that can only call agent_pay on the vault. It cannot withdraw or change policy.'],
              [ShieldCheck, 'Contract-enforced limits', 'Per-transaction limit, daily limit and approved recipients are checked on-chain for every agent payment.'],
              [KeyRound, 'Your signature for the rest', 'Withdrawals, policy changes and larger payments require your own wallet. Email links never move money.'],
              [CheckCircle2, 'Verified, never assumed', 'Nothing is shown as paid until the NEAR transaction outcome and vault record are verified.'],
            ].map(([Icon, t, b]) => (
              <li key={t} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <Icon className="size-5 text-accent-bright" />
                <h3 className="mt-3 text-[15px] font-semibold">{t}</h3>
                <p className="mt-1.5 text-[13px] text-white/65 leading-relaxed">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="benefits" className="max-w-6xl mx-auto px-5 py-20">
        <p className="eyebrow">Benefits</p>
        <h2 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">Built for founders, freelancers and small teams.</h2>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {benefits.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6 flex gap-4">
              <span className="size-10 rounded-lg bg-subtle text-ink grid place-items-center shrink-0"><Icon className="size-5" /></span>
              <div>
                <h3 className="text-[15px] font-semibold">{title}</h3>
                <p className="mt-1 text-[14px] text-muted leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-14 card p-8 sm:p-10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-canvas">
          <div>
            <h3 className="text-[22px] font-semibold tracking-[-0.02em]">Put routine payments on autopilot — safely.</h3>
            <p className="mt-1.5 text-[14px] text-muted">Create a workspace, link your NEAR wallet and fund your vault with test USDC.</p>
          </div>
          <Button to={authed ? '/app' : '/register'} size="lg" icon={ArrowRight}>{authed ? 'Open dashboard' : 'Get started'}</Button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row gap-3 sm:items-center justify-between text-[13px] text-muted">
          <Wordmark />
          <p>Built for the NEAR Hackathon 2026. Experimental software — unaudited smart contract. Testnet only.</p>
        </div>
      </footer>
    </div>
  );
}
