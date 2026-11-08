// Registry of the ONLY operations the AI may invoke. There is deliberately no transfer tool:
// createPaymentProposal routes through the deterministic policy engine and the vault contract.
import { expensesTools } from './expenses.tools.js';
import { paymentsTools } from './payments.tools.js';
import { policiesTools } from './policies.tools.js';
import { reportsTools } from './reports.tools.js';

const all = [...expensesTools, ...paymentsTools, ...policiesTools, ...reportsTools];
export const toolHandlers = Object.fromEntries(all.map((t) => [t.name, t]));
export const toolSchemas = all.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));
