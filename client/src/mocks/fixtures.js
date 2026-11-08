// [DEMO] sample data for UI development only. Clearly fabricated; never shipped to production.
const day = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();
const biz = { _id: 'demo0000000000000000000b', name: '[DEMO] Northwind Studio', onchainId: 'northwind-demo', network: 'testnet', onchainRegistered: true, ownerNearAccountId: 'demo-owner.testnet', contactEmail: 'demo@example.com' };
const recipients = [
  { _id: 'demo00000000000000000r01', name: '[DEMO] CloudDesk', nearAccountId: 'clouddesk-demo.testnet', category: 'software', approvedOnChain: true, storageRegistered: true },
  { _id: 'demo00000000000000000r02', name: '[DEMO] Lagos Print Co', nearAccountId: 'lagosprint-demo.testnet', category: 'suppliers', approvedOnChain: false, storageRegistered: true },
];
const expenses = [
  { _id: 'demo00000000000000000e01', title: '[DEMO] Design tool subscription', amount: '15000000', category: 'software', status: 'unpaid', dueDate: iso(2), recipientId: recipients[0], createdAt: iso(-10) },
  { _id: 'demo00000000000000000e02', title: '[DEMO] Brochure printing', amount: '120000000', category: 'suppliers', status: 'unpaid', dueDate: iso(6), recipientId: recipients[1], createdAt: iso(-4) },
  { _id: 'demo00000000000000000e03', title: '[DEMO] Hosting', amount: '9500000', category: 'software', status: 'paid', dueDate: iso(-3), recipientId: recipients[0], createdAt: iso(-20) },
];
const transactions = [
  { _id: 'demo00000000000000000t01', type: 'deposit', amount: '500000000', asset: 'usdc', counterparty: 'demo-owner.testnet', purpose: 'Treasury deposit', status: 'confirmed', txHash: 'DEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMO01', createdAt: iso(-12) },
  { _id: 'demo00000000000000000t02', type: 'agent_payment', amount: '9500000', asset: 'usdc', counterparty: 'clouddesk-demo.testnet', purpose: '[DEMO] Hosting', status: 'confirmed', txHash: 'DEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMO02', createdAt: iso(-3) },
  { _id: 'demo00000000000000000t03', type: 'owner_payment', amount: '40000000', asset: 'usdc', counterparty: 'lagosprint-demo.testnet', purpose: '[DEMO] Banner', status: 'failed', statusReason: 'Recipient not registered', txHash: 'DEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMOxDEMO03', createdAt: iso(-2) },
];
const series = Array.from({ length: 31 }, (_, i) => ({ date: iso(i - 30).slice(0, 10), amount: i === 27 ? '9500000' : i % 9 === 0 ? '4000000' : '0' }));

export const fixtures = {
  config: { appName: 'Bizgent', network: 'testnet', networkLabel: 'TESTNET', vaultContractId: 'vault-demo.testnet', usdcContractId: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af', usdcDecimals: 6, usdcIsOfficial: true, explorerUrl: 'https://testnet.nearblocks.io', features: { ai: false, email: false, chain: true, agentSigner: true }, demo: true },
  me: { user: { id: 'demo-user', name: '[DEMO] Ada Okafor', email: 'demo@example.com', nearAccountId: 'demo-owner.testnet' }, businesses: [biz] },
  recipients,
  expenses,
  transactions,
  dashboard: {
    spending: { totalSpent: '9500000', paymentCount: 1, byCategory: { software: '9500000' } },
    outstanding: { count: 2, total: '135000000', overdue: 0 },
    pendingApprovals: 1,
    upcoming: expenses.filter((e) => e.status !== 'paid'),
    recentTransactions: transactions,
    series,
  },
  treasury: { network: 'testnet', vaultContractId: 'vault-demo.testnet', usdcContractId: '3e22…b8af', decimals: 6, onchainId: biz.onchainId, registered: true, source: 'demo', fetchedAt: iso(0), onchain: { business_id: biz.onchainId, owner: 'demo-owner.testnet', balance: '490500000', agent: 'agent-demo.testnet', agent_paused: false, max_per_tx: '20000000', daily_limit: '50000000', spent_today: '0', remaining_today: '50000000', recipient_count: 1 } },
  agent: { agent: { status: 'active', name: 'Bizgent Agent', agentAccountId: 'agent-demo.testnet' }, policy: { maxPerTx: '20000000', dailyLimit: '50000000', autoApproveBelow: '0', requireApprovalForAll: false, spendingAlertPercent: 80 }, onchain: null, signer: { configured: true, accountId: 'agent-demo.testnet' }, ai: { configured: false, provider: 'near-ai', model: 'demo' } },
  approvals: [{ _id: 'demo00000000000000000a01', paymentId: 'bzdemo', recipientAccountId: 'lagosprint-demo.testnet', recipientName: '[DEMO] Lagos Print Co', amount: '120000000', purpose: '[DEMO] Brochure printing', reasons: ['Recipient is not on the approved-recipient list', 'Amount exceeds the per-transaction agent limit'], expiresAt: iso(1), status: 'pending', createdAt: iso(0) }],
  chat: [{ _id: 'demo-c1', role: 'assistant', content: '[DEMO] This is sample content. Connect the real API and NEAR AI Cloud to use the assistant.', createdAt: iso(0) }],
};
