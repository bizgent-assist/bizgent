import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { PaymentModal } from '../components/PaymentModal.jsx';
import { Alert, Button, Card, DataView, Modal, PageHeader, Select, StatusBadge, Table, Tabs } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { addUnits } from '../utils/money.js';
import { CATEGORY_LABELS, formatDate, relativeDue } from '../utils/format.js';

export default function Expenses() {
  const { business } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('outstanding');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delError, setDelError] = useState(null);
  const params = useMemo(() => ({ ...(status !== 'all' && { status }), ...(category && { category }), ...(q && { q }) }), [status, category, q]);
  const list = useApi(() => api.expenses.list(business._id, params), [business._id, params]);

  const total = list.data ? addUnits(...list.data.expenses.map((e) => e.amount)) : null;

  const remove = async () => {
    setDelError(null);
    try {
      await api.expenses.remove(business._id, deleting._id);
      setDeleting(null);
      list.refresh();
    } catch (e) { setDelError(e); }
  };

  const columns = [
    { key: 'title', header: 'Expense', render: (e) => (
      <div className="min-w-0">
        <div className="font-medium text-ink truncate max-w-[280px]">{e.title}</div>
        <div className="text-[12px] text-muted">{CATEGORY_LABELS[e.category]}{e.recurring !== 'none' && e.recurring ? ` · ${e.recurring}` : ''}</div>
      </div>
    ) },
    { key: 'recipient', header: 'Recipient', className: 'hidden md:table-cell', render: (e) => e.recipientId ? <div><div className="text-[13px]">{e.recipientId.name}</div><div className="text-[12px] text-muted font-mono">{e.recipientId.nearAccountId}</div></div> : <span className="text-muted">—</span> },
    { key: 'due', header: 'Due', className: 'hidden sm:table-cell', render: (e) => <div><div className="text-[13px]">{formatDate(e.dueDate)}</div>{e.status === 'unpaid' && <div className="text-[12px] text-muted">{relativeDue(e.dueDate)}</div>}</div> },
    { key: 'amount', header: 'Amount', align: 'right', render: (e) => <Money units={e.amount} className="font-medium" /> },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    { key: 'actions', header: '', align: 'right', render: (e) => (
      <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
        {e.status === 'unpaid' && <Button size="sm" variant="secondary" icon={Send} onClick={() => setPaying(e)}>Pay</Button>}
        {e.status === 'unpaid' && <Button size="sm" variant="ghost" icon={Pencil} aria-label="Edit" onClick={() => nav(`/app/expenses/${e._id}/edit`)} />}
        {['unpaid', 'cancelled'].includes(e.status) && <Button size="sm" variant="danger-ghost" icon={Trash2} aria-label="Delete" onClick={() => setDeleting(e)} />}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader eyebrow="Money" title="Expenses" description="Bills, subscriptions and supplier invoices. An expense is marked paid only after its payment is verified on-chain."
        actions={<Button icon={Plus} to="/app/expenses/new">New expense</Button>} />
      <Card padded={false}>
        <div className="px-5 pt-3">
          <Tabs value={status} onChange={setStatus} tabs={[
            { value: 'outstanding', label: 'Outstanding' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' },
          ]} />
          <div className="flex flex-col sm:flex-row gap-3 pb-4">
            <div className="relative flex-1">
              <Search className="size-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input className="input pl-9" placeholder="Search expenses" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
            </div>
            <div className="sm:w-56"><Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} aria-label="Category" /></div>
          </div>
        </div>
        <div className="border-t border-line">
          <DataView state={list} empty={{ when: (d) => !d.expenses.length, icon: FileText, title: 'No expenses here', description: 'Register a bill or subscription to track and pay it.', action: <Button icon={Plus} to="/app/expenses/new" size="sm">New expense</Button> }}>
            {(d) => (
              <>
                <Table columns={columns} rows={d.expenses} onRowClick={(e) => e.status === 'unpaid' && nav(`/app/expenses/${e._id}/edit`)} />
                <div className="flex justify-between px-5 py-3 border-t border-line text-[13px]">
                  <span className="text-muted">{d.expenses.length} expense{d.expenses.length === 1 ? '' : 's'}</span>
                  <span>Total <Money units={total} className="font-semibold" /></span>
                </div>
              </>
            )}
          </DataView>
        </div>
      </Card>

      <PaymentModal open={Boolean(paying)} expense={paying} onClose={() => { setPaying(null); list.refresh(); }} />
      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete expense?" size="sm"
        description={deleting ? `“${deleting.title}” will be permanently removed. Pending approvals for it are invalidated.` : ''}
        footer={<><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete</Button></>}>
        {delError && <Alert tone="bad">{delError.message}</Alert>}
      </Modal>
    </>
  );
}
