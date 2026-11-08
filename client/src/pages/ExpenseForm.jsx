import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Alert, Button, Card, ErrorState, Input, LoadingState, PageHeader, Select, Textarea } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { fromBaseUnits, toBaseUnits } from '../utils/money.js';
import { CATEGORY_LABELS } from '../utils/format.js';

const empty = { title: '', description: '', amount: '', category: 'software', recipientId: '', dueDate: '', recurring: 'none' };

export default function ExpenseForm() {
  const { expenseId } = useParams();
  const editing = Boolean(expenseId);
  const { business } = useAuth();
  const nav = useNavigate();
  const recipients = useApi(() => api.recipients.list(business._id), [business._id]);
  const existing = useApi(() => api.expenses.get(business._id, expenseId), [expenseId], { enabled: editing });
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const e = existing.data?.expense;
    if (!e) return;
    setForm({
      title: e.title, description: e.description || '', amount: fromBaseUnits(e.amount, 6, { group: false }), category: e.category,
      recipientId: e.recipientId?._id || '', dueDate: e.dueDate ? e.dueDate.slice(0, 10) : '', recurring: e.recurring || 'none',
    });
  }, [existing.data]);

  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });
  const locked = editing && existing.data && !['unpaid', 'cancelled'].includes(existing.data.expense.status);

  const submit = async (ev) => {
    ev.preventDefault();
    const errs = {};
    let amount;
    try { amount = toBaseUnits(form.amount); if (amount === '0') errs.amount = 'Amount must be greater than zero'; } catch (e) { errs.amount = e.message; }
    if (form.title.trim().length < 2) errs.title = 'Enter a title';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    const body = {
      title: form.title.trim(), description: form.description, amount, category: form.category,
      recipientId: form.recipientId || null, dueDate: form.dueDate ? new Date(`${form.dueDate}T12:00:00Z`).toISOString() : null, recurring: form.recurring,
    };
    try {
      if (editing) {
        const r = await api.expenses.update(business._id, expenseId, body);
        if (r.invalidatedApprovals) {
          setNotice(`${r.invalidatedApprovals} pending approval${r.invalidatedApprovals > 1 ? 's were' : ' was'} invalidated because the payable details changed.`);
          setBusy(false);
          return;
        }
      } else {
        await api.expenses.create(business._id, body);
      }
      nav('/app/expenses');
    } catch (e) {
      setError(e);
      setErrors(Object.fromEntries((e.details || []).map((d) => [d.field, d.message.replace(/^"[^"]+" /, '')])));
    } finally {
      setBusy(false);
    }
  };

  if (editing && existing.loading) return <LoadingState />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;

  return (
    <>
      <Link to="/app/expenses" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink mb-4"><ArrowLeft className="size-4" />Expenses</Link>
      <PageHeader title={editing ? 'Edit expense' : 'New expense'} description="Amounts are in USDC, the treasury asset." />
      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6" noValidate>
        <Card className="lg:col-span-2">
          <div className="space-y-4">
            {locked && <Alert tone="warn">This expense is {existing.data.expense.status.replace('_', ' ')} and can no longer be edited.</Alert>}
            {error && !error.details && <Alert tone="bad">{error.message}</Alert>}
            {notice && <Alert tone="warn" title="Approvals invalidated" action={<Button size="sm" variant="secondary" to="/app/expenses">Done</Button>}>{notice}</Alert>}
            <Input label="Title" value={form.title} onChange={set('title')} error={errors.title} placeholder="e.g. Design tool subscription" disabled={locked} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Amount" inputMode="decimal" suffix="USDC" value={form.amount} onChange={set('amount')} error={errors.amount} placeholder="0.00" disabled={locked} />
              <Select label="Category" value={form.category} onChange={set('category')} disabled={locked} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Recipient" value={form.recipientId} onChange={set('recipientId')} disabled={locked} error={errors.recipientId}
                placeholder={recipients.loading ? 'Loading…' : 'No recipient yet'}
                hint={<>Need a new supplier? <Link to="/app/recipients" className="text-accent hover:underline">Add a recipient</Link></>}
                options={(recipients.data?.recipients || []).map((r) => ({ value: r._id, label: `${r.name} (${r.nearAccountId})` }))} />
              <Input label="Due date" type="date" value={form.dueDate} onChange={set('dueDate')} disabled={locked} />
            </div>
            <Select label="Repeats" value={form.recurring} onChange={set('recurring')} disabled={locked} options={[{ value: 'none', label: 'Does not repeat' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
            <Textarea label="Description" value={form.description} onChange={set('description')} maxLength={1000} disabled={locked} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="How payment works">
            <ul className="space-y-2 text-[13px] text-muted list-disc pl-4">
              <li>Payments to approved recipients within agent limits are executed by the agent.</li>
              <li>Anything else needs your wallet signature on the Approvals page.</li>
              <li>The expense becomes <strong className="text-ink">Paid</strong> only after on-chain verification.</li>
            </ul>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" to="/app/expenses" className="flex-1">Cancel</Button>
            <Button type="submit" className="flex-1" loading={busy} disabled={locked}>{editing ? 'Save changes' : 'Create expense'}</Button>
          </div>
        </div>
      </form>
    </>
  );
}
