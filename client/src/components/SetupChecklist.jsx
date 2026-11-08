import { CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from './ui/index.jsx';

/** Shows what remains before the business can move money. Derived from real state only. */
export function SetupChecklist({ user, business, treasury, agent }) {
  const items = [
    { done: Boolean(user?.nearAccountId), label: 'Link your NEAR wallet', to: '/app/settings/profile' },
    { done: Boolean(business?.onchainRegistered), label: 'Register the business in the vault', to: '/app/settings/business' },
    { done: treasury ? BigInt(treasury.onchain?.balance || '0') > 0n : false, label: 'Deposit test USDC into the treasury', to: '/app/treasury' },
    { done: Boolean(agent?.onchain?.agent), label: 'Authorise the agent and set limits', to: '/app/agent' },
    { done: Boolean(agent?.onchain?.recipient_count), label: 'Approve at least one recipient', to: '/app/recipients' },
  ];
  const remaining = items.filter((i) => !i.done).length;
  if (!remaining) return null;
  return (
    <Card title="Finish setting up" subtitle={`${items.length - remaining} of ${items.length} complete`}>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link to={i.to} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] hover:bg-canvas h-full">
              {i.done ? <CheckCircle2 className="size-4 text-ok shrink-0" /> : <Circle className="size-4 text-faint shrink-0" />}
              <span className={i.done ? 'text-muted line-through' : 'text-ink font-medium'}>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
