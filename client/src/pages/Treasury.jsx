import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, RotateCw, Vault } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { TxLink } from '../components/TxLink.jsx';
import { Alert, Button, Card, DataView, ErrorState, Input, KeyValue, LoadingState, Modal, PageHeader, StatusBadge, Table } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useWalletFlow } from '../hooks/useWalletFlow.js';
import { api } from '../services/api/index.js';
import { fromBaseUnits, toBaseUnits } from '../utils/money.js';
import { TX_TYPE_LABELS, explorerAccountUrl, formatDateTime } from '../utils/format.js';

function MoveModal({ mode, open, onClose, onDone, maxUnits }) {
  const { business, user } = useAuth();
  const flow = useWalletFlow();
  const [amount, setAmount] = useState('');
  const [receiver, setReceiver] = useState('');
  const units = useMemo(() => { try { return toBaseUnits(amount); } catch { return null; } }, [amount]);
  const tooMuch = mode === 'withdraw' && units && maxUnits && BigInt(units) > BigInt(maxUnits);
  const deposit = mode === 'deposit';

  const go = async () => {
    try {
      let requestId;
      await flow.run({
        prepare: async () => {
          const p = deposit ? await api.treasury.prepareDeposit(business._id, units) : await api.treasury.prepareWithdraw(business._id, units, receiver.trim() || null);
          requestId = p.requestId;
          return p;
        },
        submit: (txHash) => api.treasury.submit(business._id, deposit
          ? { type: 'deposit', txHash }
          : { type: 'withdrawal', txHash, requestId, amount: units, receiverId: receiver.trim() || null }),
      });
      onDone();
    } catch { /* surfaced through flow.error */ }
  };
  const close = () => { flow.reset(); setAmount(''); setReceiver(''); onClose(); };
  const tx = flow.result?.transaction;

  return (
    <Modal open={open} onClose={close} title={deposit ? 'Deposit USDC' : 'Withdraw USDC'}
      description={deposit ? 'Sends native USDC from your wallet to the vault with ft_transfer_call, tagged with this business.' : 'Only the business owner can withdraw. Withdrawals always remain available, even if the vault is paused.'}
      footer={tx ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={go} loading={flow.busy} disabled={!units || units === '0' || tooMuch}>{flow.busy ? flow.label : deposit ? 'Deposit with wallet' : 'Withdraw with wallet'}</Button></>}>
      {tx ? (
        <div className="space-y-3">
          <Alert tone={tx.status === 'confirmed' ? 'ok' : tx.status === 'pending' ? 'warn' : 'bad'} title={tx.status === 'confirmed' ? 'Verified on-chain' : tx.status === 'pending' ? 'Waiting for verification' : `Transaction ${tx.status}`}>{tx.statusReason}</Alert>
          <KeyValue items={[['Amount', <Money units={tx.amount} />], ['Transaction', <TxLink hash={tx.txHash} url={tx.explorerUrl} />], ['Status', <StatusBadge status={tx.status} />]]} />
        </div>
      ) : (
        <div className="space-y-4">
          {flow.error && <Alert tone="bad">{flow.error.message}</Alert>}
          <Input label="Amount" inputMode="decimal" suffix="USDC" value={amount} onChange={(e) => setAmount(e.target.value)}
            error={tooMuch ? 'Exceeds the vault balance' : undefined}
            hint={units ? `${fromBaseUnits(units)} USDC will be ${deposit ? 'deposited' : 'withdrawn'} exactly.` : deposit ? 'Your wallet must hold native USDC (testnet).' : `Available: ${fromBaseUnits(maxUnits || '0')} USDC`} />
          {!deposit && <Input label="Send to (optional)" placeholder={user.nearAccountId} value={receiver} onChange={(e) => setReceiver(e.target.value)} hint="Defaults to your own wallet. The receiver must be registered with the USDC contract." />}
          <p className="text-[12px] text-muted">Signer: <span className="font-mono">{user.nearAccountId || 'no wallet linked'}</span> · attaches 1 yoctoNEAR (NEP-141 security requirement).</p>
        </div>
      )}
    </Modal>
  );
}

export default function Treasury() {
  const { business, user } = useAuth();
  const cfg = useConfig();
  const treasury = useApi(() => api.treasury.get(business._id), [business._id]);
  const history = useApi(() => api.treasury.history(business._id), [business._id]);
  const [mode, setMode] = useState(null);
  const canAct = cfg.chainSafe && business.onchainRegistered && user.nearAccountId;
  const isOwner = user.nearAccountId && user.nearAccountId === business.ownerNearAccountId;
  const refreshAll = () => { treasury.refresh(); history.refresh(); };

  return (
    <>
      <PageHeader eyebrow="Money" title="Treasury" description="Your business's isolated USDC balance inside the Bizgent vault contract, read live from NEAR."
        actions={<>
          <Button variant="secondary" icon={ArrowUpFromLine} disabled={!canAct || !isOwner} onClick={() => setMode('withdraw')}>Withdraw</Button>
          <Button icon={ArrowDownToLine} disabled={!canAct} onClick={() => setMode('deposit')}>Deposit</Button>
        </>} />
      {!user.nearAccountId && <div className="mb-4"><Alert tone="warn" title="Link a wallet to deposit or withdraw" action={<Button size="sm" variant="secondary" to="/app/settings/profile">Link wallet</Button>} /></div>}
      {!business.onchainRegistered && <div className="mb-4"><Alert tone="warn" title="Business not registered in the vault" action={<Button size="sm" variant="secondary" to="/app/settings/business">Register</Button>}>Register on-chain before depositing.</Alert></div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Vault balance" actions={<Button size="sm" variant="ghost" icon={RotateCw} onClick={treasury.reload}>Refresh</Button>}>
          {treasury.loading && !treasury.data ? <LoadingState label="Reading the vault contract…" />
            : treasury.error ? <ErrorState compact title="Balance unavailable" error={treasury.error} onRetry={treasury.reload} />
              : !treasury.data.onchain ? <p className="text-[14px] text-muted py-6">This business is not registered in the vault yet.</p> : (
                <>
                  <div className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.03em] tabular"><Money units={treasury.data.onchain.balance} /></div>
                  <p className="text-[13px] text-muted mt-1">Source: vault contract (authoritative) · {formatDateTime(treasury.data.fetchedAt)}{cfg.network !== 'mainnet' && ' · test tokens, no real value'}</p>
                  <div className="grid sm:grid-cols-3 gap-3 mt-6">
                    <div className="rounded-xl bg-canvas p-3.5"><div className="text-[12px] text-muted">Agent spent today</div><div className="mt-1 font-medium"><Money units={treasury.data.onchain.spent_today} /></div></div>
                    <div className="rounded-xl bg-canvas p-3.5"><div className="text-[12px] text-muted">Agent remaining today</div><div className="mt-1 font-medium"><Money units={treasury.data.onchain.remaining_today} /></div></div>
                    <div className="rounded-xl bg-canvas p-3.5"><div className="text-[12px] text-muted">Per-transaction limit</div><div className="mt-1 font-medium"><Money units={treasury.data.onchain.max_per_tx} /></div></div>
                  </div>
                </>
              )}
        </Card>
        <Card title="Vault details">
          <KeyValue items={[
            ['Network', `NEAR ${cfg.network}`],
            ['Vault contract', cfg.vaultContractId ? <a className="font-mono text-[12px] text-accent inline-flex items-center gap-1" href={explorerAccountUrl(cfg.vaultContractId)} target="_blank" rel="noreferrer">{cfg.vaultContractId}<ExternalLink className="size-3" /></a> : 'Not configured'],
            ['Business ID', <span className="font-mono text-[12px]">{business.onchainId}</span>],
            ['Owner', <span className="font-mono text-[12px]">{business.ownerNearAccountId || '—'}</span>],
            ['Asset', <span className="font-mono text-[11px] break-all">USDC (native) · {cfg.usdcContractId}</span>],
          ]} />
        </Card>
      </div>

      <Card className="mt-6" title="Deposits & withdrawals" padded={false}>
        <DataView state={history} empty={{ when: (d) => !d.transactions.length, icon: Vault, title: 'No deposits yet', description: 'Fund the vault with test USDC from your wallet to get started.' }}>
          {(d) => (
            <Table rows={d.transactions} columns={[
              { key: 'type', header: 'Type', render: (t) => <span className="font-medium">{TX_TYPE_LABELS[t.type]}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (t) => <Money units={t.amount} className={t.type === 'deposit' ? 'text-ok font-medium' : 'font-medium'} /> },
              { key: 'cp', header: 'From / to', className: 'hidden md:table-cell', render: (t) => <span className="font-mono text-[12px]">{t.counterparty}</span> },
              { key: 'hash', header: 'Transaction', render: (t) => <TxLink hash={t.txHash} url={t.explorerUrl} /> },
              { key: 'status', header: 'Status', render: (t) => <span title={t.statusReason}><StatusBadge status={t.status} /></span> },
              { key: 'date', header: 'Date', className: 'hidden sm:table-cell', render: (t) => <span className="text-[13px] text-muted">{formatDateTime(t.createdAt)}</span> },
            ]} />
          )}
        </DataView>
      </Card>
      <MoveModal mode={mode} open={Boolean(mode)} onClose={() => setMode(null)} onDone={refreshAll} maxUnits={treasury.data?.onchain?.balance} />
    </>
  );
}
