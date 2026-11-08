import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { Card, DataView, PageHeader, StatusBadge, Table, Tabs } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';
import { formatDateTime } from '../utils/format.js';

export default function Approvals() {
  const { business } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('pending');
  const list = useApi(() => api.approvals.list(business._id, tab === 'all' ? undefined : tab), [business._id, tab]);
  const columns = [
    { key: 'purpose', header: 'Payment', render: (a) => <div><div className="font-medium">{a.purpose}</div><div className="text-[12px] text-muted font-mono">{a.recipientName ? `${a.recipientName} · ` : ''}{a.recipientAccountId}</div></div> },
    { key: 'amount', header: 'Amount', align: 'right', render: (a) => <Money units={a.amount} className="font-medium" /> },
    { key: 'why', header: 'Why approval', className: 'hidden lg:table-cell max-w-xs', render: (a) => <span className="text-[13px] text-muted line-clamp-2">{a.reasons?.join('; ')}</span> },
    { key: 'expires', header: 'Expires', className: 'hidden sm:table-cell', render: (a) => <span className="text-[13px]">{formatDateTime(a.expiresAt)}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ];
  return (
    <>
      <PageHeader eyebrow="Money" title="Payment approvals" description="Payments outside the agent's limits wait here. Approving means signing the exact payment with your own wallet — opening an email link never moves money." />
      <Card padded={false}>
        <div className="px-5 pt-3">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'pending', label: 'Pending' }, { value: 'executed', label: 'Executed' }, { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }, { value: 'all', label: 'All' }]} />
        </div>
        <DataView state={list} empty={{ when: (d) => !d.approvals.length, icon: ShieldCheck, title: tab === 'pending' ? 'No approvals waiting' : 'Nothing here', description: 'When a payment needs your signature it appears here and you get an email.' }}>
          {(d) => <Table columns={columns} rows={d.approvals} onRowClick={(a) => nav(`/app/approvals/${a._id}`)} />}
        </DataView>
      </Card>
    </>
  );
}
