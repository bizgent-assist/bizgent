import { Expense, EXPENSE_CATEGORIES } from '../../../models/index.js';
import { fmt } from '../../payments/payments.service.js';

export const expensesTools = [
  {
    name: 'getBusinessExpenses',
    description: 'List business expenses. Filter by status and/or category.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['unpaid', 'payment_pending', 'paid', 'cancelled', 'outstanding'] },
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        limit: { type: 'integer', minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
    async run({ business }, { status, category, limit = 15 }) {
      const q = { businessId: business._id };
      if (status === 'outstanding') q.status = { $in: ['unpaid', 'payment_pending'] };
      else if (status) q.status = status;
      if (category) q.category = category;
      const rows = await Expense.find(q).sort({ dueDate: 1 }).limit(Math.min(limit, 25)).populate('recipientId', 'name nearAccountId').lean();
      return rows.map((e) => ({
        id: String(e._id), title: e.title, amount: fmt(e.amount), category: e.category, status: e.status,
        due: e.dueDate ? e.dueDate.toISOString().slice(0, 10) : null,
        recipient: e.recipientId ? `${e.recipientId.name} (${e.recipientId.nearAccountId})` : null,
      }));
    },
  },
];
