import { config } from '../config/env.js';

const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const formatDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');

export function relativeDue(d) {
  if (!d) return 'No due date';
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  return `Due in ${days} days`;
}

export const shortHash = (h) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '');
export const shortAccount = (a) => (a && a.length > 28 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a);
export const explorerTxUrl = (hash) => `${config.explorerUrl}/txns/${hash}`;
export const explorerAccountUrl = (id) => `${config.explorerUrl}/address/${id}`;

export const CATEGORY_LABELS = {
  software: 'Software subscriptions',
  payroll: 'Payroll',
  utilities: 'Utilities',
  rent: 'Rent',
  marketing: 'Marketing',
  suppliers: 'Suppliers',
  operations: 'Operations',
  other: 'Other',
};

export const TX_TYPE_LABELS = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  agent_payment: 'Agent payment',
  owner_payment: 'Owner payment',
};
