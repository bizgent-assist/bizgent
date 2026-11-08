// DEMO-ONLY mock adapter. Loaded exclusively when the dev server runs with
// VITE_ENABLE_MOCKS=true (production builds refuse that flag). Every record is labelled
// "[DEMO]" so fabricated data can never be mistaken for real business information.
// Write operations are rejected: no fake payment or transaction success is ever produced.
import { fixtures } from './fixtures.js';

const ok = (config, data) => Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
const fail = (config, status, code, message) => Promise.reject(Object.assign(new Error(message), {
  config, response: { status, data: { error: { code, message } }, headers: {}, config },
}));

export function installMockAdapter(http) {
  console.warn('[Bizgent] DEMO MODE: mock API adapter active. All data is fabricated sample data.');
  http.defaults.adapter = (config) => {
    const url = config.url.replace(/^\/businesses\/[^/]+/, '/b');
    const method = (config.method || 'get').toUpperCase();
    if (method !== 'GET') {
      if (url === '/auth/login' || url === '/auth/register') return ok(config, fixtures.me);
      if (url === '/auth/logout') return ok(config, { ok: true });
      return fail(config, 501, 'DEMO_MODE', 'Demo mode is read-only. Connect the real API to make changes.');
    }
    const routes = {
      '/config/public': fixtures.config,
      '/auth/me': fixtures.me,
      '/b/dashboard': fixtures.dashboard,
      '/b/expenses': { expenses: fixtures.expenses },
      '/b/recipients': { recipients: fixtures.recipients },
      '/b/agent': fixtures.agent,
      '/b/agent/chat': { messages: fixtures.chat, proposals: [] },
      '/b/approvals': { approvals: fixtures.approvals },
      '/b/treasury': fixtures.treasury,
      '/b/treasury/history': { transactions: fixtures.transactions.filter((t) => ['deposit', 'withdrawal'].includes(t.type)) },
      '/b/transactions': { transactions: fixtures.transactions, page: 1, limit: 25, total: fixtures.transactions.length },
      '/b/payments/proposals': { proposals: [] },
      '/b': { business: fixtures.me.businesses[0] },
    };
    if (routes[url]) return ok(config, routes[url]);
    const exp = /^\/b\/expenses\/(.+)$/.exec(url);
    if (exp) return ok(config, { expense: fixtures.expenses.find((e) => e._id === exp[1]), proposals: [] });
    const ap = /^\/b\/approvals\/(.+)$/.exec(url);
    if (ap) return ok(config, { approval: fixtures.approvals.find((a) => a._id === ap[1]), proposal: null, transaction: null });
    return fail(config, 404, 'NOT_FOUND', 'Not available in demo mode');
  };
}
