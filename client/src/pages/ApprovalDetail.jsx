import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, RotateCw, ShieldAlert, XCircle } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { TxLink } from '../components/TxLink.jsx';
import { Alert, Button, Card, ErrorState, KeyValue, LoadingState, Modal, PageHeader, StatusBadge, Textarea } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useWalletFlow } from '../hooks/useWalletFlow.js';
import { api } from '../services/api/index.js';
import { formatDateTime } from '../utils/format.js';

export default function ApprovalDetail() {
  const { approvalId } = useParams();
  const { business, user } = useAuth();
  const cfg = useConfig();
  const flow = useWalletFlow();
  const data = useApi(() => api.approvals.get(business._id, approvalId), [approvalId]);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [rejectErr, setRejectErr] = useState(null);
  const [verifying, setVerifying] = useState(false);

  if (data.loading && !data.data) return <LoadingState />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { approval: a, transaction: tx } = data.data;
  const pending = a.status === 'pending';
  const walletOk = user.nearAccountId && user.nearAccountId === business.ownerNearAccountId;

  const approve = async () => {
    try {
      await flow.run({
        prepare: () => api.approvals.prepare(business._id, a._id),
        submit: (hash) => api.approvals.submit(business._id, a._id, hash),
      });
    } catch { /* shown via flow.error */ }
    data.refresh();
  };
  const reject = async () => {
    setRejectErr(null);
    try {
      await api.approvals.reject(business._id, a._id, note);
      setRejecting(false);
      data.refresh();
    } catch (e) { setRejectErr(e); }
  };
  const reverify = async () => {
    if (!tx) return;
    setVerifying(true);
    try { await api.transactions.verify(business._id, tx._id); } finally { setVerifying(false); data.refresh(); }
  };

  return (
    <>
      <Link to="/app/approvals" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink mb-4"><ArrowLeft className="size-4" />Approvals</Link>
      <PageHeader title="Review payment" description="Check every detail. Your wallet will show the same recipient and amount before you sign." actions={<StatusBadge status={a.status} />} />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" title="Payment details">
          <div className="text-[34px] font-semibold tracking-[-0.025em] tabular"><Money units={a.amount} /></div>
          <div className="mt-1 text-[14px] text-muted">{a.purpose}</div>
          <div className="mt-5">
            <KeyValue items={[
              ['Recipient', <span><span className="font-medium">{a.recipientName || 'Unregistered recipient'}</span><br /><span className="font-mono text-[13px]">{a.recipientAccountId}</span></span>],
              ['Asset', <span className="font-mono text-[12px] break-all">USDC · {a.asset}</span>],
              ['Payment ID', <span className="font-mono text-[12px]">{a.paymentId}</span>],
              ['Requested', formatDateTime(a.createdAt)],
              ['Expires', formatDateTime(a.expiresAt)],
              ['Network', `NEAR ${cfg.network}`],
              tx && ['Transaction', <span className="inline-flex items-center gap-2"><TxLink hash={tx.txHash} url={tx.explorerUrl} /><StatusBadge status={tx.status} /></span>],
            ]} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Why approval is required">
            <ul className="space-y-1.5 text-[13px] text-ink-2 list-disc pl-4">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </Card>
          {pending && (
            <Card>
              <div className="space-y-3">
                {!walletOk && <Alert tone="warn" title="Wallet required">Link the wallet that owns this business on-chain ({business.ownerNearAccountId || 'not registered'}) in <Link className="underline" to="/app/settings/profile">Profile</Link>.</Alert>}
                {cfg.mismatches?.length > 0 && <Alert tone="bad" icon={ShieldAlert}>Network mismatch — signing disabled.</Alert>}
                {flow.error && <Alert tone="bad">{flow.error.message}</Alert>}
                <Button variant="accent" size="lg" className="w-full" icon={KeyRound} onClick={approve} loading={flow.busy} disabled={!walletOk || !cfg.chainSafe}>
                  {flow.busy ? flow.label : 'Approve & sign with wallet'}
                </Button>
                <Button variant="danger-ghost" className="w-full" icon={XCircle} onClick={() => setRejecting(true)} disabled={flow.busy}>Reject</Button>
                <p className="text-[12px] text-muted">Signing sends <span className="font-mono">owner_pay</span> to the vault with exactly these details and a 1 yoctoNEAR security deposit.</p>
              </div>
            </Card>
          )}
          {a.status === 'executing' && tx?.status === 'pending' && (
            <Alert tone="warn" title="Verifying on-chain" action={<Button size="sm" variant="secondary" icon={RotateCw} loading={verifying} onClick={reverify}>Check</Button>}>{tx.statusReason}</Alert>
          )}
          {a.status === 'executed' && <Alert tone="ok" icon={CheckCircle2} title="Payment verified on-chain">The vault recorded this payment as completed.</Alert>}
          {['failed', 'invalidated', 'expired'].includes(a.status) && <Alert tone="bad" title={`Approval ${a.status}`}>{tx?.statusReason || (a.status === 'expired' ? 'The approval window passed. Create a new payment.' : a.status === 'invalidated' ? 'Payment details changed after the request; this approval can no longer be used.' : 'The payment did not complete.')}</Alert>}
          {tx?.status === 'mismatch' && <Alert tone="bad" icon={ShieldAlert} title="Verification mismatch">{tx.statusReason}</Alert>}
        </div>
      </div>
      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject payment?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" onClick={reject}>Reject payment</Button></>}>
        <div className="space-y-3">
          {rejectErr && <Alert tone="bad">{rejectErr.message}</Alert>}
          <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </div>
      </Modal>
    </>
  );
}
