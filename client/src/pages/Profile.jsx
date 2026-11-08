import { useState } from 'react';
import { CheckCircle2, Unlink, Wallet } from 'lucide-react';
import { Alert, Button, Card, Input, KeyValue, PageHeader } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfig } from '../context/ConfigContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import { api } from '../services/api/index.js';
import { formatDateTime } from '../utils/format.js';

export default function Profile() {
  const { user, updateUser, business } = useAuth();
  const wallet = useWallet();
  const cfg = useConfig();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [linking, setLinking] = useState(false);
  const [linkErr, setLinkErr] = useState(null);

  const saveName = async () => {
    setErr(null); setMsg(null);
    try { const r = await api.auth.updateProfile({ name }); updateUser(r.user); setMsg('Profile saved.'); } catch (e) { setErr(e); }
  };
  const changePw = async () => {
    setErr(null); setMsg(null);
    try { await api.auth.changePassword(pw); setPw({ currentPassword: '', newPassword: '' }); setMsg('Password updated.'); } catch (e) { setErr(e); }
  };
  const link = async () => {
    setLinkErr(null);
    setLinking(true);
    try {
      const ch = await api.auth.walletChallenge();
      const signed = await wallet.signMessage({ message: ch.message, recipient: ch.recipient, nonceBase64: ch.nonce });
      const r = await api.auth.walletVerify({ accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature });
      updateUser(r.user);
    } catch (e) { setLinkErr(e); } finally { setLinking(false); }
  };
  const unlink = async () => {
    setLinkErr(null);
    try { const r = await api.auth.walletUnlink(); updateUser(r.user); await wallet.disconnect(); } catch (e) { setLinkErr(e); }
  };

  return (
    <>
      <PageHeader title="Profile & wallet" description="Your account and the NEAR wallet you use to sign owner actions." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="NEAR wallet" subtitle="Linked by signing a message (NEP-413). No transaction, no fees.">
          <KeyValue items={[
            ['Linked account', user.nearAccountId ? <span className="font-mono text-[13px]">{user.nearAccountId}</span> : 'Not linked'],
            ['Linked', user.walletLinkedAt ? formatDateTime(user.walletLinkedAt) : '—'],
            ['Connected in this browser', wallet.accountId ? <span className="font-mono text-[13px]">{wallet.accountId}</span> : 'Not connected'],
            ['Network', `NEAR ${cfg.network}`],
          ]} />
          <div className="mt-4 space-y-3">
            {user.nearAccountId && business.ownerNearAccountId && user.nearAccountId !== business.ownerNearAccountId && (
              <Alert tone="warn">This wallet is not the on-chain owner of {business.name} ({business.ownerNearAccountId}).</Alert>
            )}
            {wallet.accountId && user.nearAccountId && wallet.accountId !== user.nearAccountId && <Alert tone="warn">The wallet connected in this browser differs from your linked wallet. Switch accounts in your wallet before signing.</Alert>}
            {linkErr && <Alert tone="bad">{linkErr.message}</Alert>}
            <div className="flex flex-wrap gap-2">
              {!user.nearAccountId
                ? <Button icon={Wallet} onClick={link} loading={linking}>Connect & link wallet</Button>
                : <>
                  {!wallet.accountId && <Button variant="secondary" icon={Wallet} onClick={wallet.connect}>Connect wallet</Button>}
                  <Button variant="danger-ghost" icon={Unlink} onClick={unlink}>Unlink</Button>
                </>}
            </div>
            <p className="text-[12px] text-muted">Use a {cfg.network} account. Bizgent verifies the signature and that the key is a full-access key of the account.</p>
          </div>
        </Card>

        <div className="space-y-6">
          {msg && <Alert tone="ok" icon={CheckCircle2}>{msg}</Alert>}
          {err && <Alert tone="bad">{err.message}</Alert>}
          <Card title="Account">
            <div className="space-y-4">
              <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email" value={user.email} disabled />
              <div className="flex justify-end"><Button variant="secondary" onClick={saveName}>Save</Button></div>
            </div>
          </Card>
          <Card title="Change password">
            <div className="space-y-4">
              <Input label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
              <Input label="New password" type="password" autoComplete="new-password" hint="At least 10 characters." value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
              <div className="flex justify-end"><Button variant="secondary" onClick={changePw} disabled={!pw.currentPassword || pw.newPassword.length < 10}>Update password</Button></div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
