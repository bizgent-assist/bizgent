// Reporting values derived from verified records. Spending counts ONLY confirmed
// outgoing transactions. All arithmetic uses BigInt on base-unit strings.
import { Expense, Transaction, Approval } from '../models/index.js';

const OUTGOING = ['agent_payment', 'owner_payment'];

export function periodStart(period, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  switch (period) {
    case 'today': return d;
    case 'this_week': d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d;
    case 'last_30_days': d.setUTCDate(d.getUTCDate() - 30); return d;
    case 'this_year': return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case 'this_month':
    default: return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
}

export async function spendingSummary(businessId, period = 'this_month') {
  const since = periodStart(period);
  const txs = await Transaction.find({ businessId, type: { $in: OUTGOING }, status: 'confirmed', createdAt: { $gte: since } })
    .populate('expenseId', 'category').lean();
  let total = 0n;
  const byCategory = {};
  for (const t of txs) {
    const amt = BigInt(t.amount || '0');
    total += amt;
    const cat = t.expenseId?.category || 'uncategorised';
    byCategory[cat] = ((BigInt(byCategory[cat] || '0')) + amt).toString();
  }
  return { period, since, totalSpent: total.toString(), paymentCount: txs.length, byCategory };
}

export async function outstandingSummary(businessId) {
  const open = await Expense.find({ businessId, status: { $in: ['unpaid', 'payment_pending'] } }).lean();
  const total = open.reduce((a, e) => a + BigInt(e.amount), 0n);
  const now = Date.now();
  return {
    count: open.length,
    total: total.toString(),
    overdue: open.filter((e) => e.dueDate && new Date(e.dueDate).getTime() < now).length,
  };
}

/** Daily confirmed-outgoing series for the last `days` days (UTC). */
export async function spendingSeries(businessId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const txs = await Transaction.find({ businessId, type: { $in: OUTGOING }, status: 'confirmed', createdAt: { $gte: since } }).lean();
  const buckets = new Map();
  for (let i = 0; i <= days; i++) {
    const d = new Date(since.getTime() + i * 86400000).toISOString().slice(0, 10);
    buckets.set(d, 0n);
  }
  for (const t of txs) {
    const d = new Date(t.createdAt).toISOString().slice(0, 10);
    if (buckets.has(d)) buckets.set(d, buckets.get(d) + BigInt(t.amount || '0'));
  }
  return [...buckets].map(([date, amount]) => ({ date, amount: amount.toString() }));
}

export async function dashboardSummary(businessId) {
  const [spending, outstanding, pendingApprovals, upcoming, recent, series] = await Promise.all([
    spendingSummary(businessId, 'this_month'),
    outstandingSummary(businessId),
    Approval.countDocuments({ businessId, status: 'pending', expiresAt: { $gt: new Date() } }),
    Expense.find({ businessId, status: { $in: ['unpaid', 'payment_pending'] } }).sort({ dueDate: 1 }).limit(5).populate('recipientId', 'name nearAccountId').lean(),
    Transaction.find({ businessId }).sort({ createdAt: -1 }).limit(6).lean(),
    spendingSeries(businessId, 30),
  ]);
  return { spending, outstanding, pendingApprovals, upcoming, recentTransactions: recent, series };
}
