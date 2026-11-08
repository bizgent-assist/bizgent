import { useEffect, useState } from 'react';
import { CheckCircle2, Link2, ScrollText } from 'lucide-react';
import { Alert, Button, Card, DataView, Input, KeyValue, PageHeader } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useOwnerAction } from '../hooks/useOwnerAction.js';
import { api } from '../services/api/index.js';
import { formatDateTime } from '../utils/format.js';

export default function BusinessSettings() {
  const { business, user, updateBusiness } = useAuth();
  const cfg = useConfig();
  const owner = useOwnerAction();
  const logs = useApi(() => api.business.auditLogs(business._id), [business._id]);
  const [form, setForm] = useState({ name: '', country: '', industry: '', contactEmail: '' });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);
  const [syncErr, setSyncErr] = useState(null);

  useEffect(() => {
    setForm({ name: business.name || '', country: business.country || '', industry: business.industry || '', contactEmail: business.contactEmail || '' });
  }, [business]);

  const save = async () => {
    setErr(null);
    setSaved(false);
    try {
      const r = await api.business.update(business._id, form);
      updateBusiness(r.business);
      setSaved(true);
    } catch (e) { setErr(e); }
  };
  const register = async () => { try { await owner.run('register_business'); } catch { /* shown */ } };
  const sync = async () => {
    setSyncErr(null);
    try { await api.business.syncOnchain(business._id); window.location.reload(); } catch (e) { setSyncErr(e); }
  };

  return (
    <>
      <PageHeader eyebrow="Controls" title="Business settings" description="Workspace details and on-chain registration." />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Business profile">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} hint="Used for business notifications." />
              <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <Input label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </div>
            {err && <div className="mt-3"><Alert tone="bad">{err.message}</Alert></div>}
            {saved && <div className="mt-3"><Alert tone="ok" icon={CheckCircle2}>Saved.</Alert></div>}
            <div className="mt-4 flex justify-end"><Button onClick={save}>Save changes</Button></div>
          </Card>

          <Card title="Activity log" subtitle="Append-only record of financial and permission actions" padded={false}>
            <DataView state={logs} empty={{ when: (d) => !d.logs.length, icon: ScrollText, title: 'No activity yet' }}>
              {(d) => (
                <ul className="divide-y divide-line max-h-96 overflow-y-auto">
                  {d.logs.map((l) => (
                    <li key={l._id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                      <span><span className="font-mono text-[12px] text-ink">{l.action}</span> <span className="text-muted">by {l.actorType}</span></span>
                      <span className="text-muted whitespace-nowrap">{formatDateTime(l.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DataView>
          </Card>
        </div>

        <Card title="On-chain registration" subtitle="Creates this business's isolated record in the vault.">
          <KeyValue items={[
            ['Business ID', <span className="font-mono text-[12px]">{business.onchainId}</span>],
            ['Network', `NEAR ${cfg.network}`],
            ['Vault', <span className="font-mono text-[12px]">{cfg.vaultContractId || 'Not configured'}</span>],
            ['Status', business.onchainRegistered ? 'Registered' : 'Not registered'],
            ['On-chain owner', <span className="font-mono text-[12px]">{business.ownerNearAccountId || '—'}</span>],
          ]} />
          <div className="mt-4 space-y-3">
            {!user.nearAccountId && <Alert tone="warn" action={<Button size="sm" variant="secondary" to="/app/settings/profile" icon={Link2}>Link</Button>}>Link your wallet first. It becomes the on-chain owner.</Alert>}
            {owner.error && <Alert tone="bad">{owner.error.message}</Alert>}
            {syncErr && <Alert tone="bad">{syncErr.message}</Alert>}
            {!business.onchainRegistered && (
              <>
                <Button className="w-full" onClick={register} loading={owner.busy} disabled={!user.nearAccountId || !cfg.chainSafe}>{owner.busy ? owner.label : 'Register with wallet (0.1 NEAR storage)'}</Button>
                <Button className="w-full" variant="ghost" size="sm" onClick={sync}>Already registered? Sync from chain</Button>
              </>
            )}
            {business.onchainRegistered && <Button className="w-full" variant="secondary" onClick={sync}>Re-sync from chain</Button>}
            <p className="text-[12px] text-muted">The attached NEAR pays for this business's on-chain storage. The wallet that signs becomes the only account allowed to withdraw or change policy.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
