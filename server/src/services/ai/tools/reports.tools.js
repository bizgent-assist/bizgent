import { fmt } from '../../payments/payments.service.js';
import { outstandingSummary, spendingSummary } from '../../reports.service.js';

export const reportsTools = [
  {
    name: 'getSpendingSummary',
    description: 'Total verified spending for a period, broken down by category, plus outstanding (unpaid) expenses.',
    parameters: {
      type: 'object',
      properties: { period: { type: 'string', enum: ['today', 'this_week', 'this_month', 'last_30_days', 'this_year'] } },
      additionalProperties: false,
    },
    async run({ business }, { period = 'this_month' }) {
      const [s, o] = await Promise.all([spendingSummary(business._id, period), outstandingSummary(business._id)]);
      return {
        period, totalSpent: fmt(s.totalSpent), payments: s.paymentCount,
        byCategory: Object.fromEntries(Object.entries(s.byCategory).map(([k, v]) => [k, fmt(v)])),
        outstanding: { count: o.count, total: fmt(o.total), overdue: o.overdue },
        note: 'Only on-chain verified payments are counted.',
      };
    },
  },
];
