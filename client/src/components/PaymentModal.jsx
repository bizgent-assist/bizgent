import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, KeyRound, XCircle } from 'lucide-react';
import { Alert, Button, Input, KeyValue, Modal, Select, StatusBadge } from './ui/index.jsx';
import { Money } from './Money.jsx';
import { TxLink } from './TxLink.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { newIdempotencyKey } from '../services/api/http.js';
import { fromBaseUnits, toBaseUnits } from '../utils/money.js';

/** Shows the deterministic decision for a proposal — never claims success before verification. */
export function ProposalResult({ proposal }) {
  const tx = proposal.transactionId && typeof proposal.transactionId === 'object' ? proposal.transactionId : null;
  const map = {
    completed: ['ok', CheckCircle2, 'Paid and verified on-chain'],
    submitted: ['warn', Clock, 'Submitted — waiting for on-chain verification'],
    executing: ['warn', Clock, 'Executing'],
    awaiting_approval: ['warn', KeyRound, 'Needs your approval'],
    rejected: ['bad', XCircle, 'Rejected by policy'],
    failed: ['bad', XCircle, 'Payment failed'],
  };
  const [tone, icon, title] = map[proposal.status] || ['info', Clock, proposal.status];
  return (
    <div className="space-y-3">
      <Alert tone={tone} icon={icon} title={title}>
        <ul className="list-disc pl-4 space-y-0.5">{(proposal.decisionReasons || []).map((r) => <li key={r}>{r}</li>)}</ul>
        {proposal.error && <p className="mt-1">{proposal.error}</p>}
      </Alert>
      <KeyValue items={[
        ['Amount', <Money units={proposal.amount} />],
        ['Recipient', <span className="font-mono text-[13px]">{proposal.recipientAccountId}</span>],
        ['Purpose', proposal.purpose],
        ['Source', proposal.source === 'ai' ? 'AI assistant' : 'Manual'],
        ['Status', <StatusBadge status={proposal.status} />],
        tx && ['Transaction', <TxLink hash={tx.txHash} />],
      ]} />
      {proposal.status === 'awaiting_approval' && proposal.approvalId && (
        <Button to={`/app/approvals/${proposal.approvalId}`} variant="accent" icon={KeyRound} className="w-full">Review and sign</Button>
      )}
    </div>
  );
}

/** Manual payment proposal (also the fallback when the AI is unavailable). */
export function PaymentModal({ open, onClose, expense, onDone }) {
  const { business } = useAuth();
  const recipients = useApi(() => api.recipients.list(business._id), [business._id], { enabled: open });
  const [form, setForm] = useState({ recipientId: '', amount: '', purpose: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const keyRef = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    keyRef.current = newIdempotencyKey(); // one key per modal session: double-clicks never pay twice
    setResult(null);
    setError(null);
    setForm({
      recipientId: expense?.recipientId?._id || expense?.recipientId || '',
      amount: expense ? fromBaseUnits(expense.amount, 6, { group: false }) : '',
      purpose: expense?.title || '',
    });
  }, [open, expense]);

  const amountUnits = useMemo(() => { try { return toBaseUnits(form.amount); } catch { return null; } }, [form.amount]);
  const amountLocked = Boolean(expense);

  const submit = async () => {
    setError(null);
    if (!form.recipientId) return setError(new Error('Choose a recipient'));
    if (!amountUnits || amountUnits === '0') return setError(new Error('Enter a valid amount'));
    setBusy(true);
    try {
      const { proposal } = await api.payments.propose(business._id, {
        recipientId: form.recipientId, amount: amountUnits, purpose: form.purpose.trim() || 'Payment', expenseId: expense?._id || null,
      }, keyRef.current);
      const full = await api.payments.get(business._id, proposal._id).then((r) => r.proposal).catch(() => proposal);
      setResult(full);
      onDone?.(full);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={result ? 'Payment result' : 'Create payment'}
      description={result ? undefined : 'Bizgent checks your policy. Within limits the agent pays; otherwise you sign with your wallet.'}
      footer={result ? <Button onClick={onClose}>Done</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Submit for policy check</Button></>}>
      {result ? <ProposalResult proposal={result} /> : (
        <div className="space-y-4">
          {error && <Alert tone="bad">{error.message}</Alert>}
          {recipients.error && <Alert tone="bad">Could not load recipients: {recipients.error.message}</Alert>}
          <Select label="Recipient" value={form.recipientId} onChange={(e) => setForm({ ...form, recipientId: e.target.value })} disabled={Boolean(expense?.recipientId)}
            placeholder={recipients.loading ? 'Loading…' : 'Select a recipient'}
            options={(recipients.data?.recipients || []).map((r) => ({ value: r._id, label: `${r.name} · ${r.nearAccountId}${r.approvedOnChain ? '' : ' (not approved for agent)'}` }))} />
          <Input label="Amount" inputMode="decimal" suffix="USDC" value={form.amount} disabled={amountLocked}
            hint={amountLocked ? 'Amount comes from the expense. Edit the expense to change it.' : amountUnits ? `${fromBaseUnits(amountUnits)} USDC will be submitted exactly.` : 'Up to 6 decimal places.'}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label="Purpose" maxLength={140} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        </div>
      )}
    </Modal>
  );
}
