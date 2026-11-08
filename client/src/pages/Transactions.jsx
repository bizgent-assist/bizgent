import { useMemo, useState } from 'react';
import { ArrowLeftRight, RotateCw } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { TxLink } from '../components/TxLink.jsx';
import { Button, Card, DataView, Input, KeyValue, Modal, PageHeader, Select, StatusBadge, Table } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { TX_TYPE_LABELS, formatDateTime } from '../utils/format.js';

export default function Transactions() {
  const { business } = useAuth();
  const [f, setF] = useState({ type: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const params = useMemo(() => ({
    page, limit: 25, ...(f.type && { type: f.type }), ...(f.status && { status: f.status }),
    ...(f.from && { from: new Date(`${f.from}T00:00:00`).toISOString() }), ...(f.to && { to: new Date(`${f.to}T23:59:59`).toISOString() }),
  }), [f, page]);
  const list = useApi(() => api.transactions.list(business._id, params), [business._id, params]);
  const set = (k) => (e) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  const hasPending = list.data?.transactions.some((t) => t.status === 'pending');

  const reverify = async () => {
    setVerifying(true);
    try { await api.transactions.reverify(business._id); } finally { setVerifying(false); list.refresh(); }
  };

  const columns = [
    { key: 'type', header: 'Type', render: (t) => <div><div className="font-medium">{TX_TYPE_LABELS[t.type]}</div><div className="text-[12px] text-muted truncate max-w-[220px]">{t.expenseId?.title || t.purpose}</div></div> },
    { key: 'cp', header: 'Counterparty', className: 'hidden md:table-cell', render: (t) => <span className="font-mono text-[12px]">{t.counterparty}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (t) => <Money units={t.amount} className={`font-medium ${t.type === 'deposit' ? 'text-ok' : ''}`} /> },
    { key: 'status', header: 'Status', render: (t) => <span title={t.statusReason}><StatusBadge status={t.status} /></span> },
    { key: 'hash', header: 'Hash', className: 'hidden sm:table-cell', render: (t) => <TxLink hash={t.txHash} url={t.explorerUrl} /> },
    { key: 'date', header: 'Date', className: 'hidden lg:table-cell', render: (t) => <span className="text-[13px] text-muted">{formatDateTime(t.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader eyebrow="Money" title="Transactions" description="Every deposit, payment and withdrawal with its NEAR transaction. Status reflects the verified on-chain outcome."
        actions={hasPending && <Button variant="secondary" icon={RotateCw} loading={verifying} onClick={reverify}>Re-verify pending</Button>} />
      <Card padded={false}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-line">
          <Select aria-label="Type" value={f.type} onChange={set('type')} placeholder="All types" options={Object.entries(TX_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          <Select aria-label="Status" value={f.status} onChange={set('status')} placeholder="All statuses" options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'pending', label: 'Pending' }, { value: 'failed', label: 'Failed' }, { value: 'mismatch', label: 'Mismatch' }]} />
          <Input aria-label="From date" type="date" value={f.from} onChange={set('from')} />
          <Input aria-label="To date" type="date" value={f.to} onChange={set('to')} />
        </div>
        <DataView state={list} empty={{ when: (d) => !d.transactions.length, icon: ArrowLeftRight, title: 'No transactions found', description: 'Try clearing filters, or make your first deposit.' }}>
          {(d) => (
            <>
              <Table columns={columns} rows={d.transactions} onRowClick={setSelected} />
              <div className="flex items-center justify-between px-5 py-3 border-t border-line text-[13px] text-muted">
                <span>{d.total} transaction{d.total === 1 ? '' : 's'}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="secondary" disabled={page * d.limit >= d.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </DataView>
      </Card>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Transaction">
        {selected && (
          <KeyValue items={[
            ['Type', TX_TYPE_LABELS[selected.type]],
            ['Amount', <Money units={selected.amount} />],
            ['Status', <StatusBadge status={selected.status} />],
            ['Verification', selected.statusReason || '—'],
            ['Counterparty', <span className="font-mono text-[12px]">{selected.counterparty}</span>],
            ['Signer', <span className="font-mono text-[12px]">{selected.signerId}</span>],
            ['Purpose', selected.purpose || '—'],
            selected.paymentId && ['Payment ID', <span className="font-mono text-[12px]">{selected.paymentId}</span>],
            ['Transaction', <TxLink hash={selected.txHash} url={selected.explorerUrl} />],
            ['Network', selected.network],
            ['Created', formatDateTime(selected.createdAt)],
            ['Verified', formatDateTime(selected.verifiedAt)],
          ]} />
        )}
      </Modal>
    </>
  );
}
