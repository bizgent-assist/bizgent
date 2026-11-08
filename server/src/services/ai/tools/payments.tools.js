import { env } from '../../../config/env.js';
import { Expense, Recipient, Transaction } from '../../../models/index.js';
import { parseDecimal } from '../../../utils/money.js';
import { createProposal, explorerTx, fmt } from '../../payments/payments.service.js';

async function resolveRecipient(business, ref) {
  if (!ref) return null;
  const s = String(ref).trim().toLowerCase();
  const byAccount = await Recipient.findOne({ businessId: business._id, nearAccountId: s });
  if (byAccount) return byAccount;
  const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = await Recipient.find({ businessId: business._id, name: new RegExp(`^${escaped}$`, 'i') }).limit(2);
  return byName.length === 1 ? byName[0] : null;
}

export const paymentsTools = [
  {
    name: 'createPaymentProposal',
    description: 'Create ONE payment proposal when the user explicitly asks to pay. Bizgent policy decides whether it executes automatically, needs owner approval, or is rejected.',
    parameters: {
      type: 'object',
      properties: {
        expenseId: { type: 'string', description: 'Expense id, when paying a registered expense' },
        recipient: { type: 'string', description: 'Registered recipient name or NEAR account id (optional when expenseId has a recipient)' },
        amount: { type: 'string', description: 'Decimal USDC amount, e.g. "15" or "15.50" (optional when expenseId given)' },
        purpose: { type: 'string', description: 'Short purpose, max 140 chars' },
      },
      required: ['purpose'],
      additionalProperties: false,
    },
    async run(ctx, args) {
      if (ctx.proposalsThisTurn >= 1) return { error: 'Only one payment proposal per request.' };
      const { business, user } = ctx;
      let expense = null;
      if (args.expenseId) {
        if (!/^[a-f0-9]{24}$/i.test(args.expenseId)) return { error: 'Invalid expense id' };
        expense = await Expense.findOne({ _id: args.expenseId, businessId: business._id });
        if (!expense) return { error: 'Expense not found' };
      }
      let amount;
      try {
        amount = args.amount ? parseDecimal(args.amount, env.USDC_DECIMALS) : expense?.amount;
      } catch (e) {
        return { error: e.message };
      }
      if (!amount) return { error: 'Amount is required' };
      if (expense && amount !== expense.amount) {
        return { error: `Amount ${fmt(amount)} differs from the expense amount ${fmt(expense.amount)}. Ask the user to confirm or edit the expense.` };
      }
      const recipient = expense?.recipientId
        ? await Recipient.findOne({ _id: expense.recipientId, businessId: business._id })
        : await resolveRecipient(business, args.recipient);
      if (!recipient) return { error: 'Recipient not found among registered recipients. The user must add the recipient first.' };

      ctx.proposalsThisTurn += 1;
      const { proposal } = await createProposal({
        business, user, source: 'ai', recipientId: recipient._id, amount,
        purpose: String(args.purpose || expense?.title || 'Payment').slice(0, 140), expenseId: expense?._id,
        idempotencyKey: `ai:${ctx.turnId}`,
      });
      ctx.proposalIds.push(proposal._id);
      const tx = proposal.transactionId ? await Transaction.findById(proposal.transactionId).lean() : null;
      return {
        proposalId: String(proposal._id), decision: proposal.decision, status: proposal.status, reasons: proposal.decisionReasons,
        amount: fmt(proposal.amount), recipient: `${recipient.name} (${recipient.nearAccountId})`,
        transaction: tx ? { status: tx.status, explorer: explorerTx(tx.txHash) } : null,
        error: proposal.error || undefined,
      };
    },
  },
  {
    name: 'getPaymentHistory',
    description: 'Recent treasury transactions (deposits, payments, withdrawals) with verified status.',
    parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false },
    async run({ business }, { limit = 10 }) {
      const rows = await Transaction.find({ businessId: business._id }).sort({ createdAt: -1 }).limit(Math.min(limit, 20)).lean();
      return rows.map((t) => ({
        type: t.type, amount: t.amount ? fmt(t.amount) : 'unknown', counterparty: t.counterparty, purpose: t.purpose,
        status: t.status, date: t.createdAt.toISOString().slice(0, 10),
      }));
    },
  },
];
