// Centralised API contract (see docs/API.md). Pages never call axios directly.
import { http, newIdempotencyKey } from './http.js';

// Statically analysable condition: in production builds DEV is `false`, so the mock
// adapter and its fixtures are removed from the bundle entirely.
if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
  const { installMockAdapter } = await import('../../mocks/adapter.js');
  installMockAdapter(http);
}

const d = (p) => p.then((r) => r.data);
const biz = (id) => `/businesses/${id}`;

export const api = {
  config: { public: () => d(http.get('/config/public')) },

  auth: {
    me: () => d(http.get('/auth/me')),
    register: (body) => d(http.post('/auth/register', body)),
    login: (body) => d(http.post('/auth/login', body)),
    logout: () => d(http.post('/auth/logout')),
    forgotPassword: (email) => d(http.post('/auth/forgot-password', { email })),
    resetPassword: (token, password) => d(http.post('/auth/reset-password', { token, password })),
    updateProfile: (body) => d(http.patch('/auth/me', body)),
    changePassword: (body) => d(http.post('/auth/change-password', body)),
    walletChallenge: () => d(http.post('/auth/wallet/challenge')),
    walletVerify: (body) => d(http.post('/auth/wallet/verify', body)),
    walletUnlink: () => d(http.delete('/auth/wallet')),
  },

  business: {
    list: () => d(http.get('/businesses')),
    get: (id) => d(http.get(biz(id))),
    update: (id, body) => d(http.patch(biz(id), body)),
    dashboard: (id) => d(http.get(`${biz(id)}/dashboard`)),
    auditLogs: (id) => d(http.get(`${biz(id)}/audit-logs`)),
    prepareOnchain: (id, action, params) => d(http.post(`${biz(id)}/onchain/prepare`, { action, params })),
    syncOnchain: (id) => d(http.post(`${biz(id)}/onchain/sync`)),
  },

  expenses: {
    list: (id, params) => d(http.get(`${biz(id)}/expenses`, { params })),
    get: (id, eid) => d(http.get(`${biz(id)}/expenses/${eid}`)),
    create: (id, body) => d(http.post(`${biz(id)}/expenses`, body)),
    update: (id, eid, body) => d(http.patch(`${biz(id)}/expenses/${eid}`, body)),
    remove: (id, eid) => d(http.delete(`${biz(id)}/expenses/${eid}`)),
  },

  recipients: {
    list: (id) => d(http.get(`${biz(id)}/recipients`)),
    create: (id, body) => d(http.post(`${biz(id)}/recipients`, body)),
    update: (id, rid, body) => d(http.patch(`${biz(id)}/recipients/${rid}`, body)),
    remove: (id, rid) => d(http.delete(`${biz(id)}/recipients/${rid}`)),
    check: (id, rid) => d(http.post(`${biz(id)}/recipients/${rid}/check`)),
  },

  agent: {
    get: (id) => d(http.get(`${biz(id)}/agent`)),
    update: (id, body) => d(http.patch(`${biz(id)}/agent`, body)),
    updatePolicy: (id, body) => d(http.patch(`${biz(id)}/agent/policy`, body)),
    chat: (id, message) => d(http.post(`${biz(id)}/agent/chat`, { message })),
    history: (id) => d(http.get(`${biz(id)}/agent/chat`)),
  },

  payments: {
    propose: (id, body, key = newIdempotencyKey()) => d(http.post(`${biz(id)}/payments/proposals`, body, { headers: { 'idempotency-key': key } })),
    list: (id) => d(http.get(`${biz(id)}/payments/proposals`)),
    get: (id, pid) => d(http.get(`${biz(id)}/payments/proposals/${pid}`)),
  },

  approvals: {
    list: (id, status) => d(http.get(`${biz(id)}/approvals`, { params: status ? { status } : {} })),
    get: (id, aid) => d(http.get(`${biz(id)}/approvals/${aid}`)),
    prepare: (id, aid) => d(http.post(`${biz(id)}/approvals/${aid}/prepare`)),
    submit: (id, aid, txHash) => d(http.post(`${biz(id)}/approvals/${aid}/submit`, { txHash })),
    reject: (id, aid, note) => d(http.post(`${biz(id)}/approvals/${aid}/reject`, { note })),
  },

  treasury: {
    get: (id) => d(http.get(`${biz(id)}/treasury`)),
    prepareDeposit: (id, amount) => d(http.post(`${biz(id)}/treasury/deposit/prepare`, { amount })),
    prepareWithdraw: (id, amount, receiverId) => d(http.post(`${biz(id)}/treasury/withdraw/prepare`, { amount, receiverId })),
    submit: (id, body) => d(http.post(`${biz(id)}/treasury/submit`, body)),
    history: (id) => d(http.get(`${biz(id)}/treasury/history`)),
  },

  transactions: {
    list: (id, params) => d(http.get(`${biz(id)}/transactions`, { params })),
    get: (id, tid) => d(http.get(`${biz(id)}/transactions/${tid}`)),
    verify: (id, tid) => d(http.post(`${biz(id)}/transactions/${tid}/verify`)),
    reverify: (id) => d(http.post(`${biz(id)}/transactions/reverify`)),
  },
};
