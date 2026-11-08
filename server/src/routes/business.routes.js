// All routes under /businesses/:businessId are ownership-scoped by loadBusiness, and every
// query below filters by req.business._id. Frontend filtering is never relied upon.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { loadBusiness, validate } from '../middleware/index.js';
import {
  Agent, AgentPolicy, Approval, AuditLog, Business, ChatMessage, Expense, PaymentProposal, Recipient, Transaction,
} from '../models/index.js';
import { chat } from '../services/ai/ai.service.js';
import { audit } from '../services/audit.js';
import { chain } from '../services/near/chain.js';
import {
  createProposal, executeAgentPayment, explorerTx, finalizeTransaction, invalidateApprovalsForExpense,
  loadApproval, prepareApproval, rejectApproval, submitApprovalTx,
} from '../services/payments/payments.service.js';
import {
  getTreasury, prepareDeposit, prepareOwnerAction, prepareWithdraw, reverifyPending, submitTreasuryTx, syncFromChain,
} from '../services/payments/treasury.service.js';
import { dashboardSummary } from '../services/reports.service.js';
import { ApiError } from '../utils/errors.js';
import { s } from '../validators/schemas.js';
import { createBusinessFor } from './auth.routes.js';

const r = Router();
const b = Router({ mergeParams: true });
r.use('/:businessId', loadBusiness, b);

const withExplorer = (t) => ({ ...(t.toObject ? t.toObject() : t), explorerUrl: explorerTx(t.txHash) });
const idParam = (name) => (req, _res, next) => (/^[a-f0-9]{24}$/i.test(req.params[name]) ? next() : next(ApiError.notFound()));

// ----------------------------------------------------------------- businesses
r.get('/', async (req, res) => {
  res.json({ businesses: await Business.find({ ownerId: req.user._id }) });
});
r.post('/', validate(s.business.fork(['name'], (x) => x.required())), async (req, res) => {
  const count = await Business.countDocuments({ ownerId: req.user._id });
  if (count >= 3) throw ApiError.conflict('Business limit reached for this MVP', 'LIMIT');
  const business = await createBusinessFor(req.user, req.body);
  res.status(201).json({ business });
});
b.get('/', (req, res) => res.json({ business: req.business }));
b.patch('/', validate(s.business), async (req, res) => {
  Object.assign(req.business, req.body);
  await req.business.save();
  res.json({ business: req.business });
});
b.get('/dashboard', async (req, res) => {
  const summary = await dashboardSummary(req.business._id);
  res.json({ ...summary, recentTransactions: summary.recentTransactions.map(withExplorer) });
});
b.get('/audit-logs', async (req, res) => {
  res.json({ logs: await AuditLog.find({ businessId: req.business._id }).sort({ createdAt: -1 }).limit(50).lean() });
});

// ----------------------------------------------------------------- on-chain owner actions
b.post('/onchain/prepare', validate(s.onchainPrepare), (req, res) => {
  res.json(prepareOwnerAction(req.business, req.user, req.body.action, req.body.params));
});
b.post('/onchain/sync', async (req, res) => {
  res.json(await syncFromChain(req.business, req.user));
});

// ----------------------------------------------------------------- expenses
b.get('/expenses', validate(s.expenseQuery, 'query'), async (req, res) => {
  const { status, category, q, from, to } = req.validQuery;
  const filter = { businessId: req.business._id };
  if (status === 'outstanding') filter.status = { $in: ['unpaid', 'payment_pending'] };
  else if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) filter.title = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (from || to) filter.dueDate = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const expenses = await Expense.find(filter).sort({ dueDate: 1, createdAt: -1 }).populate('recipientId', 'name nearAccountId approvedOnChain').lean();
  res.json({ expenses });
});
b.post('/expenses', validate(s.expenseCreate), async (req, res) => {
  if (req.body.recipientId && !(await Recipient.exists({ _id: req.body.recipientId, businessId: req.business._id }))) throw ApiError.badRequest('Recipient not found');
  const expense = await Expense.create({ ...req.body, businessId: req.business._id, createdBy: req.user._id });
  await audit({ businessId: req.business._id, actorType: 'user', actorId: req.user._id, action: 'expense.created', entityType: 'Expense', entityId: expense._id });
  res.status(201).json({ expense });
});
b.get('/expenses/:expenseId', idParam('expenseId'), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.expenseId, businessId: req.business._id }).populate('recipientId').populate('paidTransactionId').lean();
  if (!expense) throw ApiError.notFound('Expense not found');
  const proposals = await PaymentProposal.find({ businessId: req.business._id, expenseId: expense._id }).sort({ createdAt: -1 }).lean();
  res.json({ expense, proposals });
});
b.patch('/expenses/:expenseId', idParam('expenseId'), validate(s.expenseUpdate), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.expenseId, businessId: req.business._id });
  if (!expense) throw ApiError.notFound('Expense not found');
  if (['paid', 'payment_pending'].includes(expense.status)) throw ApiError.conflict(`Cannot edit an expense that is ${expense.status.replace('_', ' ')}`, 'EXPENSE_LOCKED');
  if (req.body.recipientId && !(await Recipient.exists({ _id: req.body.recipientId, businessId: req.business._id }))) throw ApiError.badRequest('Recipient not found');
  const payableChanged = (req.body.amount && req.body.amount !== expense.amount)
    || (req.body.recipientId !== undefined && String(req.body.recipientId) !== String(expense.recipientId));
  Object.assign(expense, req.body);
  await expense.save();
  const invalidated = payableChanged || req.body.status === 'cancelled' ? await invalidateApprovalsForExpense(req.business, expense._id) : 0;
  await audit({ businessId: req.business._id, actorType: 'user', actorId: req.user._id, action: 'expense.updated', entityType: 'Expense', entityId: expense._id, details: { fields: Object.keys(req.body), invalidatedApprovals: invalidated } });
  res.json({ expense, invalidatedApprovals: invalidated });
});
b.delete('/expenses/:expenseId', idParam('expenseId'), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.expenseId, businessId: req.business._id });
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== 'unpaid' && expense.status !== 'cancelled') throw ApiError.conflict('Only unpaid or cancelled expenses can be deleted', 'EXPENSE_LOCKED');
  await invalidateApprovalsForExpense(req.business, expense._id);
  await expense.deleteOne();
  await audit({ businessId: req.business._id, actorType: 'user', actorId: req.user._id, action: 'expense.deleted', entityType: 'Expense', entityId: expense._id });
  res.json({ ok: true });
});

// ----------------------------------------------------------------- recipients
b.get('/recipients', async (req, res) => {
  res.json({ recipients: await Recipient.find({ businessId: req.business._id }).sort({ name: 1 }).lean() });
});
b.post('/recipients', validate(s.recipientCreate), async (req, res) => {
  const recipient = await Recipient.create({ ...req.body, businessId: req.business._id });
  try { // USDC registration only needs the token contract, not the vault
    recipient.storageRegistered = (await chain().storageBalanceOf(recipient.nearAccountId)) !== null;
    recipient.lastCheckedAt = new Date();
    await recipient.save();
  } catch { /* RPC unavailable: leave unknown (null), never assume */ }
  res.status(201).json({ recipient });
});
b.patch('/recipients/:recipientId', idParam('recipientId'), validate(s.recipientUpdate), async (req, res) => {
  const recipient = await Recipient.findOneAndUpdate({ _id: req.params.recipientId, businessId: req.business._id }, req.body, { returnDocument: 'after' });
  if (!recipient) throw ApiError.notFound('Recipient not found');
  res.json({ recipient });
});
b.delete('/recipients/:recipientId', idParam('recipientId'), async (req, res) => {
  const recipient = await Recipient.findOne({ _id: req.params.recipientId, businessId: req.business._id });
  if (!recipient) throw ApiError.notFound('Recipient not found');
  if (recipient.approvedOnChain) throw ApiError.conflict('Remove this recipient from the on-chain approved list first', 'RECIPIENT_APPROVED_ONCHAIN');
  await recipient.deleteOne();
  res.json({ ok: true });
});
b.post('/recipients/:recipientId/check', idParam('recipientId'), async (req, res) => {
  const recipient = await Recipient.findOne({ _id: req.params.recipientId, businessId: req.business._id });
  if (!recipient) throw ApiError.notFound('Recipient not found');
  const c = chain();
  const [storage, approved] = await Promise.all([
    c.storageBalanceOf(recipient.nearAccountId),
    env.chainConfigured && req.business.onchainRegistered ? c.isRecipientApproved(req.business.onchainId, recipient.nearAccountId) : false,
  ]);
  recipient.storageRegistered = storage !== null;
  recipient.approvedOnChain = approved;
  recipient.lastCheckedAt = new Date();
  await recipient.save();
  res.json({ recipient });
});

// ----------------------------------------------------------------- agent + policy + chat
b.get('/agent', async (req, res) => {
  const [agent, policy] = await Promise.all([
    Agent.findOne({ businessId: req.business._id }).lean(),
    AgentPolicy.findOne({ businessId: req.business._id }).lean(),
  ]);
  let onchain = null;
  let onchainError = null;
  if (env.chainConfigured && req.business.onchainRegistered) {
    try { onchain = await chain().getBusiness(req.business.onchainId); } catch (e) { onchainError = e.message; }
  }
  res.json({
    agent, policy, onchain, onchainError,
    signer: { configured: env.agentConfigured, accountId: env.AGENT_ACCOUNT_ID || null },
    ai: { configured: env.aiConfigured, provider: env.AI_PROVIDER, model: env.AI_MODEL },
  });
});
b.patch('/agent', validate(s.agentUpdate), async (req, res) => {
  const agent = await Agent.findOneAndUpdate({ businessId: req.business._id }, req.body, { returnDocument: 'after', upsert: true });
  await audit({ businessId: req.business._id, actorType: 'user', actorId: req.user._id, action: 'agent.updated', details: req.body });
  res.json({ agent });
});
b.get('/agent/policy', async (req, res) => {
  res.json({ policy: await AgentPolicy.findOne({ businessId: req.business._id }).lean() });
});
b.patch('/agent/policy', validate(s.policyUpdate), async (req, res) => {
  const policy = await AgentPolicy.findOneAndUpdate({ businessId: req.business._id }, req.body, { returnDocument: 'after', upsert: true });
  await audit({ businessId: req.business._id, actorType: 'user', actorId: req.user._id, action: 'policy.updated', details: req.body });
  res.json({ policy });
});

const chatLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
b.post('/agent/chat', chatLimiter, validate(s.chat), async (req, res) => {
  const out = await chat({ business: req.business, user: req.user, message: req.body.message });
  const proposals = out.proposalIds.length ? await PaymentProposal.find({ _id: { $in: out.proposalIds } }).lean() : [];
  res.json({ message: out.message, proposals, toolTrace: out.toolTrace, usage: out.usage, model: out.model });
});
b.get('/agent/chat', async (req, res) => {
  const messages = await ChatMessage.find({ businessId: req.business._id, userId: req.user._id }).sort({ createdAt: -1 }).limit(40).lean();
  const ids = messages.flatMap((m) => m.proposalIds || []);
  const proposals = ids.length ? await PaymentProposal.find({ _id: { $in: ids }, businessId: req.business._id }).lean() : [];
  res.json({ messages: messages.reverse(), proposals });
});

// ----------------------------------------------------------------- payment proposals
b.post('/payments/proposals', validate(s.proposal), async (req, res) => {
  const key = req.get('idempotency-key');
  if (!key || !/^[A-Za-z0-9:_-]{8,100}$/.test(key)) throw ApiError.badRequest('Idempotency-Key header (8-100 chars) is required');
  const { proposal, replayed } = await createProposal({
    business: req.business, user: req.user, source: 'user', ...req.body, idempotencyKey: `user:${key}`, ip: req.ip,
  });
  res.status(replayed ? 200 : 201).json({ proposal, replayed });
});
b.get('/payments/proposals', async (req, res) => {
  res.json({ proposals: await PaymentProposal.find({ businessId: req.business._id }).sort({ createdAt: -1 }).limit(50).lean() });
});
b.get('/payments/proposals/:proposalId', idParam('proposalId'), async (req, res) => {
  const proposal = await PaymentProposal.findOne({ _id: req.params.proposalId, businessId: req.business._id }).populate('transactionId').lean();
  if (!proposal) throw ApiError.notFound('Proposal not found');
  res.json({ proposal });
});
b.post('/payments/proposals/:proposalId/execute', idParam('proposalId'), async (req, res) => {
  const proposal = await PaymentProposal.findOne({ _id: req.params.proposalId, businessId: req.business._id });
  if (!proposal) throw ApiError.notFound('Proposal not found');
  res.json({ proposal: await executeAgentPayment(req.business, proposal, req.user) });
});

// ----------------------------------------------------------------- approvals
b.get('/approvals', async (req, res) => {
  await Approval.updateMany({ businessId: req.business._id, status: 'pending', expiresAt: { $lte: new Date() } }, { status: 'expired' });
  const filter = { businessId: req.business._id };
  if (typeof req.query.status === 'string' && /^[a-z]+$/.test(req.query.status)) filter.status = req.query.status;
  res.json({ approvals: await Approval.find(filter).sort({ createdAt: -1 }).limit(50).populate('transactionId').lean() });
});
b.get('/approvals/:approvalId', idParam('approvalId'), async (req, res) => {
  const approval = await loadApproval(req.business, req.params.approvalId);
  const [proposal, tx] = await Promise.all([
    PaymentProposal.findOne({ _id: approval.proposalId, businessId: req.business._id }).lean(),
    approval.transactionId ? Transaction.findById(approval.transactionId).lean() : null,
  ]);
  res.json({ approval, proposal, transaction: tx ? withExplorer(tx) : null });
});
b.post('/approvals/:approvalId/prepare', idParam('approvalId'), async (req, res) => {
  res.json(await prepareApproval(req.business, req.user, req.params.approvalId));
});
b.post('/approvals/:approvalId/submit', idParam('approvalId'), validate(s.txSubmit), async (req, res) => {
  const tx = await submitApprovalTx(req.business, req.user, req.params.approvalId, req.body.txHash, req.ip);
  res.json({ transaction: withExplorer(tx) });
});
b.post('/approvals/:approvalId/reject', idParam('approvalId'), validate(s.reject), async (req, res) => {
  res.json({ approval: await rejectApproval(req.business, req.user, req.params.approvalId, req.body.note, req.ip) });
});

// ----------------------------------------------------------------- treasury
b.get('/treasury', async (req, res) => {
  res.json(await getTreasury(req.business));
});
b.post('/treasury/deposit/prepare', validate(s.deposit), (req, res) => {
  res.json(prepareDeposit(req.business, req.user, req.body.amount));
});
b.post('/treasury/withdraw/prepare', validate(s.withdraw), (req, res) => {
  res.json(prepareWithdraw(req.business, req.user, req.body.amount, req.body.receiverId || null));
});
b.post('/treasury/submit', validate(s.treasurySubmit), async (req, res) => {
  const tx = await submitTreasuryTx(req.business, req.user, req.body, req.ip);
  res.json({ transaction: withExplorer(tx) });
});
b.get('/treasury/history', async (req, res) => {
  const rows = await Transaction.find({ businessId: req.business._id, type: { $in: ['deposit', 'withdrawal'] } }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ transactions: rows.map(withExplorer) });
});

// ----------------------------------------------------------------- transactions
b.get('/transactions', validate(s.txQuery, 'query'), async (req, res) => {
  const { type, status, from, to, page, limit } = req.validQuery;
  const filter = { businessId: req.business._id };
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (from || to) filter.createdAt = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [rows, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('expenseId', 'title category').lean(),
    Transaction.countDocuments(filter),
  ]);
  res.json({ transactions: rows.map(withExplorer), page, limit, total });
});
b.get('/transactions/:transactionId', idParam('transactionId'), async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.transactionId, businessId: req.business._id }).populate('expenseId', 'title category').lean();
  if (!tx) throw ApiError.notFound('Transaction not found');
  res.json({ transaction: withExplorer(tx) });
});
b.post('/transactions/:transactionId/verify', idParam('transactionId'), async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.transactionId, businessId: req.business._id });
  if (!tx) throw ApiError.notFound('Transaction not found');
  res.json({ transaction: withExplorer(await finalizeTransaction(tx)) });
});
b.post('/transactions/reverify', async (req, res) => {
  res.json({ checked: await reverifyPending(req.business._id) });
});

export default r;
