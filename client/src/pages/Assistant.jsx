import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp, Bot, PenLine, Sparkles, User, Wrench } from 'lucide-react';
import { PaymentModal, ProposalResult } from '../components/PaymentModal.jsx';
import { Alert, Button, Card, ErrorState, LoadingState, PageHeader, cx } from '../components/ui/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api } from '../services/api/index.js';

const SUGGESTIONS = [
  'What is our treasury balance?',
  'Show me all outstanding expenses.',
  'How much have we spent on software this month?',
  "What are the agent's spending limits?",
];

/** Minimal, safe rendering of assistant text: paragraphs, bullets and **bold** only. */
function RichText({ text }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  return blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      return <ul key={i} className="list-disc pl-5 space-y-0.5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>)}</ul>;
    }
    return <p key={i} className="whitespace-pre-wrap">{inline(b)}</p>;
  });
}

function Message({ m, proposals }) {
  const mine = m.role === 'user';
  const linked = (m.proposalIds || []).map((id) => proposals[id]).filter(Boolean);
  return (
    <div className={cx('flex gap-3', mine && 'flex-row-reverse')}>
      <div className={cx('size-8 rounded-full grid place-items-center shrink-0', mine ? 'bg-ink text-white' : 'bg-accent-soft text-accent')}>
        {mine ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cx('min-w-0 max-w-[85%] sm:max-w-[75%] space-y-2', mine && 'items-end flex flex-col')}>
        <div className={cx('rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed space-y-2', mine ? 'bg-ink text-white rounded-tr-md' : 'bg-surface border border-line rounded-tl-md text-ink')}>
          {mine ? <p className="whitespace-pre-wrap">{m.content}</p> : <RichText text={m.content} />}
        </div>
        {m.toolTrace?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
            {m.toolTrace.map((t, i) => <span key={i} className="inline-flex items-center gap-1 rounded-md bg-subtle px-1.5 py-0.5"><Wrench className="size-3" />{t.name}{!t.ok && ' (failed)'}</span>)}
          </div>
        )}
        {linked.map((p) => <div key={p._id} className="card p-4 w-full"><ProposalResult proposal={p} /></div>)}
      </div>
    </div>
  );
}

export default function Assistant() {
  const { business } = useAuth();
  const loc = useLocation();
  const history = useApi(() => api.agent.history(business._id), [business._id]);
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState({});
  const [input, setInput] = useState(loc.state?.prompt || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!history.data) return;
    setMessages(history.data.messages);
    setProposals(Object.fromEntries(history.data.proposals.map((p) => [p._id, p])));
  }, [history.data]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    const temp = { _id: `local-${Date.now()}`, role: 'user', content: message };
    setMessages((m) => [...m, temp]);
    try {
      const res = await api.agent.chat(business._id, message);
      setProposals((p) => ({ ...p, ...Object.fromEntries(res.proposals.map((x) => [x._id, x])) }));
      setMessages((m) => [...m, res.message]);
    } catch (e) {
      setError(e);
      setMessages((m) => m.filter((x) => x._id !== temp._id));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const aiDown = error && ['AI_UNAVAILABLE', 'AI_CREDITS_EXHAUSTED', 'AI_DAILY_LIMIT'].includes(error.code);

  return (
    <>
      <PageHeader eyebrow="Overview" title="AI assistant" description="Ask about expenses and spending, or ask it to pay a bill. Bizgent's policy engine and the vault contract decide what can happen — the AI cannot override them."
        actions={<Button variant="secondary" icon={PenLine} onClick={() => setManual(true)}>Create payment manually</Button>} />
      <Card padded={false} className="flex flex-col h-[calc(100dvh-260px)] min-h-[460px]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-canvas/60">
          {history.loading && <LoadingState label="Loading conversation…" />}
          {history.error && <ErrorState compact error={history.error} onRetry={history.reload} />}
          {!history.loading && !history.error && messages.length === 0 && (
            <div className="max-w-lg mx-auto text-center py-8">
              <div className="size-12 rounded-2xl bg-accent-soft text-accent grid place-items-center mx-auto"><Sparkles className="size-6" /></div>
              <h2 className="mt-4 text-[17px] font-semibold">How can I help with your finances?</h2>
              <p className="mt-1 text-[13px] text-muted">Answers come from your verified records and the on-chain vault.</p>
              <div className="mt-6 grid sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="text-left rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] text-ink-2 hover:border-line-strong">{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m) => <Message key={m._id} m={m} proposals={proposals} />)}
          {sending && <div className="flex gap-3"><div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center"><Bot className="size-4" /></div><div className="rounded-2xl rounded-tl-md bg-surface border border-line px-4 py-3"><span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-faint animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</span></div></div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-line p-3 sm:p-4 bg-surface rounded-b-[var(--radius-card)]">
          {error && (
            <div className="mb-3">
              <Alert tone={aiDown ? 'warn' : 'bad'} title={aiDown ? 'Assistant unavailable' : 'Message failed'}
                action={aiDown ? <Button size="sm" variant="secondary" onClick={() => setManual(true)}>Pay manually</Button> : null}>
                {error.message}
              </Alert>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
            <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="e.g. Pay our monthly software subscription" aria-label="Message"
              className="input h-auto min-h-11 max-h-36 py-2.5 resize-none" />
            <Button type="submit" className="h-11 w-11 !px-0 shrink-0" disabled={!input.trim()} loading={sending} aria-label="Send">{!sending && <ArrowUp className="size-5" />}</Button>
          </form>
          <p className="mt-2 text-[11px] text-faint">AI responses can be wrong. Payments are always checked by policy and verified on-chain.</p>
        </div>
      </Card>
      <PaymentModal open={manual} onClose={() => setManual(false)} />
    </>
  );
}
