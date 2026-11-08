import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Alert, Button, Input } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api/index.js';

function Heading({ title, sub }) {
  return (
    <div className="mb-7">
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{title}</h1>
      {sub && <p className="mt-1.5 text-[14px] text-muted">{sub}</p>}
    </div>
  );
}

const fieldErrors = (err) => Object.fromEntries((err?.details || []).map((d) => [d.field, d.message.replace(/^"[^"]+" /, '')]));

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form);
      const next = params.get('next');
      nav(next?.startsWith('/app') ? next : '/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Heading title="Sign in" sub="Welcome back to Bizgent." />
      {params.get('expired') && <Alert tone="warn" title="Session expired">Please sign in again.</Alert>}
      {params.get('reset') && <Alert tone="ok" icon={CheckCircle2} title="Password updated">Sign in with your new password.</Alert>}
      {error && <Alert tone="bad">{error.message}</Alert>}
      <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <Input label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      <div className="flex justify-end"><Link to="/forgot-password" className="text-[13px] font-medium text-accent hover:underline">Forgot password?</Link></div>
      <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in</Button>
      <p className="text-center text-[13px] text-muted">New to Bizgent? <Link to="/register" className="font-medium text-ink hover:underline">Create an account</Link></p>
    </form>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', businessName: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fe = fieldErrors(error);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(form);
      nav('/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Heading title="Create your account" sub="Set up a business workspace in under a minute." />
      {error && !error.details && <Alert tone="bad">{error.message}</Alert>}
      <Input label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={fe.name} required />
      <Input label="Work email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={fe.email} required />
      <Input label="Business name" value={form.businessName} onChange={set('businessName')} error={fe.businessName} required />
      <Input label="Password" type="password" autoComplete="new-password" hint="At least 10 characters." value={form.password} onChange={set('password')} error={fe.password} required />
      <Button type="submit" className="w-full" size="lg" loading={busy}>Create account</Button>
      <p className="text-center text-[13px] text-muted">Already have an account? <Link to="/login" className="font-medium text-ink hover:underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone((await api.auth.forgotPassword(email)).message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Heading title="Reset your password" sub="We'll email you a secure link to choose a new password." />
      {done ? <Alert tone="ok" icon={CheckCircle2} title="Check your inbox">{done}</Alert> : (
        <>
          {error && <Alert tone="bad">{error.message}</Alert>}
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" className="w-full" size="lg" loading={busy}>Send reset link</Button>
        </>
      )}
      <p className="text-center text-[13px] text-muted"><Link to="/login" className="font-medium text-ink hover:underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword(token, password);
      nav('/login?reset=1', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return <div><Heading title="Invalid reset link" /><Alert tone="bad">This link is malformed. Request a new one.</Alert><Button className="mt-4" to="/forgot-password" variant="secondary">Request new link</Button></div>;
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Heading title="Choose a new password" />
      {error && <Alert tone="bad">{error.message}</Alert>}
      <Input label="New password" type="password" autoComplete="new-password" hint="At least 10 characters." value={password} onChange={(e) => setPassword(e.target.value)} required />
      <Button type="submit" className="w-full" size="lg" loading={busy}>Update password</Button>
    </form>
  );
}
