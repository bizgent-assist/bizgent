import { useState } from 'react';
import { BadgeCheck, CircleAlert, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2, Users } from 'lucide-react';
import { Alert, Badge, Button, Card, DataView, Input, Modal, PageHeader, Select, Table } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useOwnerAction } from '../hooks/useOwnerAction.js';
import { api } from '../services/api/index.js';
import { CATEGORY_LABELS } from '../utils/format.js';

export default function Recipients() {
  const { business, user } = useAuth();
  const cfg = useConfig();
  const list = useApi(() => api.recipients.list(business._id), [business._id]);
  const owner = useOwnerAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', nearAccountId: '', category: 'suppliers', email: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);
  const [actionErr, setActionErr] = useState(null);
  const canSign = cfg.chainSafe && business.onchainRegistered && user.nearAccountId === business.ownerNearAccountId;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.recipients.create(business._id, { ...form, nearAccountId: form.nearAccountId.trim().toLowerCase() });
      setAdding(false);
      setForm({ name: '', nearAccountId: '', category: 'suppliers', email: '' });
      list.refresh();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const onchain = async (r, approve) => {
    setRowBusy(r._id);
    setActionErr(null);
    try { await owner.run(approve ? 'add_recipient' : 'remove_recipient', { accountId: r.nearAccountId }); } catch (e) { setActionErr(e); }
    setRowBusy(null);
    list.refresh();
  };
  const check = async (r) => {
    setRowBusy(r._id);
    try { await api.recipients.check(business._id, r._id); } catch (e) { setActionErr(e); }
    setRowBusy(null);
    list.refresh();
  };
  const remove = async (r) => {
    setActionErr(null);
    try { await api.recipients.remove(business._id, r._id); list.refresh(); } catch (e) { setActionErr(e); }
  };

  const columns = [
    { key: 'name', header: 'Recipient', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-[12px] text-muted font-mono break-all">{r.nearAccountId}</div></div> },
    { key: 'cat', header: 'Category', className: 'hidden md:table-cell', render: (r) => <span className="text-[13px]">{CATEGORY_LABELS[r.category]}</span> },
    { key: 'agent', header: 'Agent may pay', render: (r) => (r.approvedOnChain ? <Badge tone="ok" icon={ShieldCheck}>Approved on-chain</Badge> : <Badge>Owner approval</Badge>) },
    { key: 'storage', header: 'USDC registered', className: 'hidden sm:table-cell', render: (r) => (r.storageRegistered === true ? <Badge tone="ok" icon={BadgeCheck}>Yes</Badge> : r.storageRegistered === false ? <Badge tone="bad" icon={CircleAlert}>Not registered</Badge> : <Badge>Unknown</Badge>) },
    { key: 'act', header: '', align: 'right', render: (r) => (
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={rowBusy === r._id && !owner.busy} onClick={() => check(r)} aria-label="Re-check on-chain" />
        {r.approvedOnChain
          ? <Button size="sm" variant="secondary" icon={ShieldOff} disabled={!canSign || owner.busy} loading={rowBusy === r._id && owner.busy} onClick={() => onchain(r, false)}>Revoke</Button>
          : <Button size="sm" variant="secondary" icon={ShieldCheck} disabled={!canSign || owner.busy} loading={rowBusy === r._id && owner.busy} onClick={() => onchain(r, true)}>Approve</Button>}
        {!r.approvedOnChain && <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={() => remove(r)} aria-label="Delete" />}
      </div>
    ) },
  ];

  return (
    <>
      <PageHeader eyebrow="Controls" title="Recipients" description="Suppliers and payees. The agent can only pay recipients you approve on-chain; anyone else needs your wallet signature."
        actions={<Button icon={Plus} onClick={() => setAdding(true)}>Add recipient</Button>} />
      <div className="space-y-4">
        {!canSign && <Alert tone="info" title="On-chain approval requires the owner wallet">Register the business and link the owner wallet to approve recipients for the agent.</Alert>}
        {owner.busy && <Alert tone="warn">{owner.label}</Alert>}
        {(actionErr || owner.error) && <Alert tone="bad">{(actionErr || owner.error).message}</Alert>}
        <Card padded={false}>
          <DataView state={list} empty={{ when: (d) => !d.recipients.length, icon: Users, title: 'No recipients yet', description: 'Add the NEAR accounts of suppliers you pay regularly.', action: <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add recipient</Button> }}>
            {(d) => <Table columns={columns} rows={d.recipients} />}
          </DataView>
        </Card>
        <p className="text-[12px] text-muted">A recipient must be registered with the USDC contract (NEP-145 storage) to receive tokens. Transfers to unregistered accounts fail and the vault restores the balance.</p>
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add recipient"
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={create} loading={busy}>Add recipient</Button></>}>
        <div className="space-y-4">
          {err && <Alert tone="bad">{err.details?.map((x) => x.message).join('; ') || err.message}</Alert>}
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. CloudDesk Ltd" />
          <Input label="NEAR account" value={form.nearAccountId} onChange={(e) => setForm({ ...form, nearAccountId: e.target.value })} placeholder={`supplier.${cfg.network === 'mainnet' ? 'near' : 'testnet'}`} hint="Double-check this. Payments to a wrong account cannot be reversed." />
          <div className="grid sm:grid-cols-2 gap-4">
            <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
            <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
      </Modal>
    </>
  );
}
