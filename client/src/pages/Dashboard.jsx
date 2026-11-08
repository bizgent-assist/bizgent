import { ArrowRight, CalendarClock, FileText, ShieldCheck, Sparkles, Vault, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Money } from '../components/Money.jsx';
import { SetupChecklist } from '../components/SetupChecklist.jsx';
import { SpendingChart } from '../components/SpendingChart.jsx';
import { TxLink } from '../components/TxLink.jsx';
import { Button, Card, DataView, EmptyState, ErrorState, LoadingState, PageHeader, Stat, StatusBadge } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { CATEGORY_LABELS, TX_TYPE_LABELS, formatDate, relativeDue } from '../utils/format.js';

function BalanceStat({ treasury }) {
  if (treasury.loading && !treasury.data) return <div className="card p-5"><LoadingState label="Reading vault…" /></div>;
  if (treasury.error) {
    return (
      <div className="card p-4 sm:p-5">
        <span className="text-[13px] font-medium text-muted">Treasury balance</span>
        <div className="mt-2 text-[15px] font-medium text-bad">Unavailable</div>
        <div className="mt-1 text-[12px] text-muted truncate" title={treasury.error.message}>{treasury.error.message}</div>
        <button type="button" onClick={treasury.reload} className="mt-2 text-[12px] font-medium text-accent hover:underline">Retry</button>
      </div>
    );
  }
  const t = treasury.data;
  if (!t.onchain) return <Stat label="Treasury balance" value="Not registered" sub="Register the business on-chain" icon={Vault} />;
  return <Stat label="Treasury balance" value={<Money units={t.onchain.balance} />} sub={`On-chain · read ${formatDate(t.fetchedAt)}`} icon={Vault} />;
}

export default function Dashboard() {
  const { business, user } = useAuth();
  const nav = useNavigate();
  const summary = useApi(() => api.business.dashboard(business._id), [business._id]);
  const treasury = useApi(() => api.treasury.get(business._id), [business._id]);
  const agent = useApi(() => api.agent.get(business._id), [business._id]);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`}
        description="Your treasury, spending and anything that needs your attention."
        actions={<><Button variant="secondary" icon={FileText} to="/app/expenses/new">New expense</Button><Button icon={Sparkles} to="/app/assistant">Ask Bizgent</Button></>}
      />

      <div className="space-y-6">
        <SetupChecklist user={user} business={business} treasury={treasury.data} agent={agent.data} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <BalanceStat treasury={treasury} />
          {summary.error ? (
            <div className="sm:col-span-1 xl:col-span-3 card"><ErrorState compact error={summary.error} onRetry={summary.reload} /></div>
          ) : summary.loading && !summary.data ? (
            <div className="sm:col-span-1 xl:col-span-3 card"><LoadingState /></div>
          ) : (
            <>
              <Stat label="Spent this month" value={<Money units={summary.data.spending.totalSpent} />} sub={`${summary.data.spending.paymentCount} verified payment${summary.data.spending.paymentCount === 1 ? '' : 's'}`} icon={Wallet} />
              <Stat label="Outstanding expenses" value={<Money units={summary.data.outstanding.total} />} sub={`${summary.data.outstanding.count} open · ${summary.data.outstanding.overdue} overdue`} icon={CalendarClock} tone={summary.data.outstanding.overdue ? 'warn' : undefined} />
              <Link to="/app/approvals" className="block"><Stat label="Pending approvals" value={summary.data.pendingApprovals} sub={summary.data.pendingApprovals ? 'Waiting for your signature' : 'Nothing waiting'} icon={ShieldCheck} tone={summary.data.pendingApprovals ? 'warn' : undefined} /></Link>
            </>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <Card title="Spending overview" subtitle="Verified outgoing payments, last 30 days" className="lg:col-span-2">
            <DataView state={summary} loadingRows={3}>
              {(d) => (BigInt(d.spending.totalSpent) === 0n && d.series.every((p) => p.amount === '0')
                ? <EmptyState icon={Wallet} title="No verified spending yet" description="Payments appear here once confirmed on-chain." />
                : (
                  <>
                    <SpendingChart series={d.series} />
                    {Object.keys(d.spending.byCategory).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
                        {Object.entries(d.spending.byCategory).map(([k, v]) => (
                          <div key={k}><span className="text-muted">{CATEGORY_LABELS[k] || 'Uncategorised'}</span> <Money units={v} className="font-medium" /></div>
                        ))}
                      </div>
                    )}
                  </>
                ))}
            </DataView>
          </Card>

          <Card title="Ask your finance agent" subtitle="Natural-language answers from verified records">
            <div className="space-y-2">
              {['How much have we spent on subscriptions this month?', 'Show me all outstanding expenses.', 'Pay the design tool subscription.'].map((q) => (
                <button key={q} type="button" onClick={() => nav('/app/assistant', { state: { prompt: q } })}
                  className="w-full text-left rounded-lg border border-line px-3 py-2.5 text-[13px] text-ink-2 hover:bg-canvas hover:border-line-strong transition-colors">
                  {q}
                </button>
              ))}
            </div>
            <Button to="/app/assistant" variant="secondary" className="w-full mt-4" icon={Sparkles}>Open assistant</Button>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Upcoming expenses" actions={<Button to="/app/expenses" variant="ghost" size="sm">View all <ArrowRight className="size-4" /></Button>} padded={false}>
            <DataView state={summary} empty={{ when: (d) => !d.upcoming.length, icon: CalendarClock, title: 'Nothing due', description: 'Outstanding expenses will appear here.' }}>
              {(d) => (
                <ul className="divide-y divide-line">
                  {d.upcoming.map((e) => (
                    <li key={e._id}>
                      <Link to={`/app/expenses/${e._id}/edit`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium truncate">{e.title}</div>
                          <div className="text-[12px] text-muted">{relativeDue(e.dueDate)} · {e.recipientId?.name || 'No recipient'}</div>
                        </div>
                        <div className="text-right"><Money units={e.amount} className="text-[14px] font-medium" /><div className="mt-0.5"><StatusBadge status={e.status} /></div></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </DataView>
          </Card>

          <Card title="Recent transactions" actions={<Button to="/app/transactions" variant="ghost" size="sm">View all <ArrowRight className="size-4" /></Button>} padded={false}>
            <DataView state={summary} empty={{ when: (d) => !d.recentTransactions.length, icon: Wallet, title: 'No transactions yet', description: 'Deposits and payments appear here with explorer links.' }}>
              {(d) => (
                <ul className="divide-y divide-line">
                  {d.recentTransactions.map((t) => (
                    <li key={t._id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-medium truncate">{TX_TYPE_LABELS[t.type]} · {t.purpose || t.counterparty}</div>
                        <div className="text-[12px] text-muted flex items-center gap-2">{formatDate(t.createdAt)} <TxLink hash={t.txHash} url={t.explorerUrl} /></div>
                      </div>
                      <div className="text-right">
                        <Money units={t.amount} className={`text-[14px] font-medium ${t.type === 'deposit' ? 'text-ok' : ''}`} />
                        <div className="mt-0.5"><StatusBadge status={t.status} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DataView>
          </Card>
        </div>
      </div>
    </>
  );
}
