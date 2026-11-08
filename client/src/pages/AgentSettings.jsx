import { useEffect, useState } from 'react';
import { Bot, Pause, Play, ShieldCheck, ShieldOff, Sparkles } from 'lucide-react';
import { Money } from '../components/Money.jsx';
import { Alert, Badge, Button, Card, ErrorState, Input, KeyValue, LoadingState, PageHeader, StatusBadge, Toggle } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useOwnerAction } from '../hooks/useOwnerAction.js';
import { api } from '../services/api/index.js';
import { fromBaseUnits, toBaseUnits } from '../utils/money.js';

const dec = (u) => (u && u !== '0' ? fromBaseUnits(u, 6, { group: false }) : '');

export default function AgentSettings() {
  const { business, user } = useAuth();
  const cfg = useConfig();
  const data = useApi(() => api.agent.get(business._id), [business._id]);
  const owner = useOwnerAction();
  const [limits, setLimits] = useState({ maxPerTx: '', dailyLimit: '' });
  const [limitErr, setLimitErr] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsErr, setPrefsErr] = useState(null);

  useEffect(() => {
    if (!data.data) return;
    const oc = data.data.onchain;
    setLimits({ maxPerTx: dec(oc?.max_per_tx), dailyLimit: dec(oc?.daily_limit) });
    const p = data.data.policy || {};
    setPrefs({ autoApproveBelow: dec(p.autoApproveBelow), requireApprovalForAll: Boolean(p.requireApprovalForAll), spendingAlertPercent: p.spendingAlertPercent ?? 80 });
  }, [data.data]);

  if (data.loading && !data.data) return <LoadingState />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { agent, onchain, onchainError, signer, ai } = data.data;
  const canSign = cfg.chainSafe && business.onchainRegistered && user.nearAccountId === business.ownerNearAccountId;
  const after = () => data.refresh();

  const saveLimits = async () => {
    setLimitErr(null);
    let maxPerTx;
    let dailyLimit;
    try { maxPerTx = toBaseUnits(limits.maxPerTx || '0'); dailyLimit = toBaseUnits(limits.dailyLimit || '0'); } catch (e) { return setLimitErr(e); }
    if (BigInt(maxPerTx) > BigInt(dailyLimit)) return setLimitErr(new Error('Per-transaction limit cannot exceed the daily limit'));
    try { await owner.run('set_policy', { maxPerTx, dailyLimit }); } catch (e) { setLimitErr(e); }
    after();
  };
  const savePrefs = async () => {
    setPrefsErr(null);
    setPrefsSaved(false);
    try {
      await api.agent.updatePolicy(business._id, {
        autoApproveBelow: prefs.autoApproveBelow ? toBaseUnits(prefs.autoApproveBelow) : '0',
        requireApprovalForAll: prefs.requireApprovalForAll,
        spendingAlertPercent: Number(prefs.spendingAlertPercent) || 0,
      });
      setPrefsSaved(true);
      after();
    } catch (e) { setPrefsErr(e); }
  };
  const ownerAct = async (action, params) => { try { await owner.run(action, params); } catch { /* shown */ } after(); };
  const setStatus = async (status) => { await api.agent.update(business._id, { status }); after(); };

  const onchainAgentOk = onchain?.agent && onchain.agent === signer.accountId;

  return (
    <>
      <PageHeader eyebrow="Controls" title="Agent & policy" description="Limits are enforced by the vault contract. The backend can only make them stricter, never looser." />
      <div className="space-y-4 mb-6">
        {!canSign && <Alert tone="info" title="Owner wallet required for on-chain changes">Register the business and link the owner wallet to authorise the agent or change limits.</Alert>}
        {onchainError && <Alert tone="bad" title="On-chain state unavailable">{onchainError}</Alert>}
        {owner.busy && <Alert tone="warn">{owner.label}</Alert>}
        {owner.error && <Alert tone="bad">{owner.error.message}</Alert>}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Agent authority" subtitle="A dedicated agent account with a key that can only call agent_pay.">
            <KeyValue items={[
              ['Agent account (server signer)', signer.configured ? <span className="font-mono text-[13px]">{signer.accountId}</span> : <Badge tone="warn">Not configured on server</Badge>],
              ['Authorised on-chain', onchain ? (onchain.agent ? <span className="font-mono text-[13px]">{onchain.agent}</span> : <Badge>None</Badge>) : '—'],
              ['On-chain state', onchain ? (onchain.agent_paused ? <Badge tone="warn" icon={Pause}>Paused</Badge> : onchain.agent ? <Badge tone="ok" icon={ShieldCheck}>Active</Badge> : <Badge>Not authorised</Badge>) : '—'],
              ['Bizgent switch', <StatusBadge status={agent?.status || 'not_configured'} />],
            ]} />
            {onchain?.agent && !onchainAgentOk && <div className="mt-3"><Alert tone="warn">The on-chain agent differs from the server's signer account. Automatic payments are disabled until they match.</Alert></div>}
            <div className="mt-5 flex flex-wrap gap-2">
              {!onchainAgentOk && <Button icon={ShieldCheck} disabled={!canSign || !signer.configured || owner.busy} onClick={() => ownerAct('set_agent')}>Authorise agent</Button>}
              {onchain?.agent && (onchain.agent_paused
                ? <Button variant="secondary" icon={Play} disabled={!canSign || owner.busy} onClick={() => ownerAct('set_agent_paused', { paused: false })}>Resume on-chain</Button>
                : <Button variant="secondary" icon={Pause} disabled={!canSign || owner.busy} onClick={() => ownerAct('set_agent_paused', { paused: true })}>Pause on-chain</Button>)}
              {onchain?.agent && <Button variant="danger-ghost" icon={ShieldOff} disabled={!canSign || owner.busy} onClick={() => ownerAct('revoke_agent')}>Revoke agent</Button>}
              {agent?.status === 'active' && <Button variant="ghost" onClick={() => setStatus('suspended')}>Suspend in Bizgent</Button>}
              {agent?.status === 'suspended' && <Button variant="ghost" onClick={() => setStatus('active')}>Reactivate in Bizgent</Button>}
            </div>
          </Card>

          <Card title="Contract-enforced limits" subtitle="Changing limits requires your wallet signature.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Maximum per payment" suffix="USDC" inputMode="decimal" value={limits.maxPerTx} onChange={(e) => setLimits({ ...limits, maxPerTx: e.target.value })} placeholder="0.00" />
              <Input label="Daily spending limit" suffix="USDC" inputMode="decimal" value={limits.dailyLimit} onChange={(e) => setLimits({ ...limits, dailyLimit: e.target.value })} placeholder="0.00" />
            </div>
            {onchain && <p className="mt-3 text-[13px] text-muted">Today: <Money units={onchain.spent_today} /> spent · <Money units={onchain.remaining_today} /> remaining (UTC day).</p>}
            {limitErr && <div className="mt-3"><Alert tone="bad">{limitErr.message}</Alert></div>}
            <div className="mt-4 flex justify-end"><Button onClick={saveLimits} loading={owner.busy} disabled={!canSign}>Save limits on-chain</Button></div>
          </Card>

          {prefs && (
            <Card title="Bizgent approval rules" subtitle="Optional backend rules that are stricter than the contract.">
              <Toggle label="Require my approval for every payment" description="The agent never pays automatically, even within limits." checked={prefs.requireApprovalForAll} onChange={(v) => setPrefs({ ...prefs, requireApprovalForAll: v })} />
              <div className="grid sm:grid-cols-2 gap-4 mt-2">
                <Input label="Automatic payments only below" suffix="USDC" inputMode="decimal" placeholder="Use contract limit" value={prefs.autoApproveBelow} onChange={(e) => setPrefs({ ...prefs, autoApproveBelow: e.target.value })} />
                <Input label="Spending alert at (% of daily limit)" type="number" min="0" max="100" value={prefs.spendingAlertPercent} onChange={(e) => setPrefs({ ...prefs, spendingAlertPercent: e.target.value })} />
              </div>
              <p className="mt-3 text-[12px] text-muted">New recipients always require approval until you approve them on-chain.</p>
              {prefsErr && <div className="mt-3"><Alert tone="bad">{prefsErr.message}</Alert></div>}
              {prefsSaved && <div className="mt-3"><Alert tone="ok">Saved.</Alert></div>}
              <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={savePrefs}>Save rules</Button></div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="AI assistant">
            <KeyValue items={[
              ['Provider', ai.provider === 'near-ai' ? 'NEAR AI Cloud' : ai.provider],
              ['Model', <span className="font-mono text-[12px]">{ai.model}</span>],
              ['Status', ai.configured ? <Badge tone="ok" icon={Sparkles}>Configured</Badge> : <Badge tone="warn">Not configured</Badge>],
            ]} />
            <p className="mt-3 text-[12px] text-muted">The AI can read records and create proposals. It has no signing key and cannot change limits.</p>
          </Card>
          <Card title="What the agent can and cannot do">
            <ul className="space-y-2 text-[13px]">
              {[[true, 'Pay approved recipients within both limits'], [true, 'Stop instantly when paused or revoked'], [false, 'Withdraw funds'], [false, 'Change limits or recipients'], [false, 'Pay unapproved recipients']].map(([ok, t]) => (
                <li key={t} className="flex gap-2">{ok ? <ShieldCheck className="size-4 text-ok shrink-0" /> : <ShieldOff className="size-4 text-bad shrink-0" />}{t}</li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-2 text-[12px] text-muted"><Bot className="size-4" />Enforced by the vault contract, not by the AI.</div>
          </Card>
        </div>
      </div>
    </>
  );
}
