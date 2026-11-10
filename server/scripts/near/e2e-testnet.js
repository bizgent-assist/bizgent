// Real NEAR testnet end-to-end check of the Bizgent API + deployed vault.
// Operator tooling: drives the HTTP API exactly like the frontend does, but signs the owner's
// transactions headlessly with the owner's local testnet key (~/.near-credentials) instead of a
// browser wallet. Nothing is mocked: every "Paid" comes from the backend's on-chain verifier.
//
//   node scripts/near/e2e-testnet.js --phase setup   # user, wallet link, register business on-chain
//   node scripts/near/create-agent.js --business <onchainId>   # then restart the API
//   node scripts/near/e2e-testnet.js --phase flow    # agent, policy, recipient, deposit, payments, revoke, withdraw
//
// State (login + ids) is kept in server/.e2e-state.json (git-ignored). Secrets are never printed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { Account, actions } from 'near-api-js';
import { signMessage } from 'near-api-js/nep413';
import { NETWORK, RPC, arg, provider, view } from './common.js';

const API = arg('api', process.env.E2E_API_URL || 'http://localhost:4000/api/v1');
const OWNER = arg('owner', process.env.E2E_OWNER_ACCOUNT_ID || 'bizgent-owner-jayflint-2026-testnet.testnet');
const SUPPLIER = arg('supplier');
const STATE_FILE = '.e2e-state.json';
const phase = arg('phase', 'setup');
const USDC = (n) => String(Math.round(n * 1e6)); // test-script literals only; the app uses string base units

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const cred = (id) => JSON.parse(readFileSync(join(homedir(), '.near-credentials', NETWORK, `${id}.json`), 'utf8'));
const owner = new Account(OWNER, provider, cred(OWNER).private_key);
const results = [];
const log = (ok, step, detail = '') => { results.push({ ok, step }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  — ${detail}` : ''}`); };
const explorer = (h) => `https://testnet.nearblocks.io/txns/${h}`;

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'e2e', method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.result;
}

let cookie = '';
async function api(method, path, body, headers = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'bizgent', origin: process.env.E2E_ORIGIN || 'http://localhost:5173', cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function must(method, path, body, headers) {
  const r = await api(method, path, body, headers);
  if (r.status >= 400) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.data?.error || r.data)}`);
  return r.data;
}
const biz = () => `/businesses/${state.businessId}`;

/** Sign a backend-prepared transaction with the owner key (what the browser wallet does). */
async function signPrepared(t) {
  if (t.signerId !== OWNER) throw new Error(`Prepared signer ${t.signerId} is not the owner`);
  const res = await owner.signAndSendTransaction({
    receiverId: t.receiverId,
    actions: [actions.functionCall(t.methodName, t.args, BigInt(t.gas), BigInt(t.deposit || '0'))],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  });
  return res.transaction.hash;
}
async function ownerAction(action, params = {}) {
  const { transaction } = await must('POST', `${biz()}/onchain/prepare`, { action, params });
  const hash = await signPrepared(transaction);
  const sync = await must('POST', `${biz()}/onchain/sync`);
  return { hash, sync };
}
async function login() {
  await must('POST', '/auth/login', { email: state.email, password: state.password });
}

async function setup() {
  if (!state.email) {
    state.email = arg('email', 'bizgent.assist@gmail.com');
    state.password = crypto.randomBytes(12).toString('base64url') + 'A1!';
    const r = await must('POST', '/auth/register', { name: 'Bizgent Demo Owner', email: state.email, password: state.password, businessName: 'Jayflint Studio' });
    state.businessId = r.businesses[0]._id;
    state.onchainId = r.businesses[0].onchainId;
    save();
    log(true, 'Register owner user + business', `business ${state.onchainId} (login saved to server/${STATE_FILE})`);
  } else {
    await login();
  }
  const me = await must('GET', '/auth/me');
  if (me.user.nearAccountId !== OWNER) {
    const ch = await must('POST', '/auth/wallet/challenge');
    const signed = await signMessage({ signerAccount: owner, payload: { message: ch.message, recipient: ch.recipient, nonce: Uint8Array.from(Buffer.from(ch.nonce, 'base64')) } });
    const sig = typeof signed.signature === 'string' ? signed.signature : Buffer.from(signed.signature).toString('base64');
    const v = await must('POST', '/auth/wallet/verify', { accountId: OWNER, publicKey: signed.publicKey.toString(), signature: sig });
    log(v.user.nearAccountId === OWNER, 'Link owner wallet with NEP-413 signature (verified server-side)');
  }
  const b = (await must('GET', biz())).business;
  if (!b.onchainRegistered) {
    const { hash, sync } = await ownerAction('register_business');
    log(sync.registered, 'Owner signs register_business; backend reads it back from the vault', explorer(hash));
  }
  console.log(`\nNext: node scripts/near/create-agent.js --business ${state.onchainId}  (then restart the API and run --phase flow)`);
}

async function payExpense(title, amount, recipientId) {
  const { expense } = await must('POST', `${biz()}/expenses`, { title, amount, category: 'software', recipientId });
  const { proposal } = await must('POST', `${biz()}/payments/proposals`, { recipientId, amount, purpose: title, expenseId: expense._id }, { 'idempotency-key': `e2e-${crypto.randomUUID()}` });
  return { expense, proposal };
}

async function flow() {
  await login();
  const cfg = await must('GET', '/config/public');
  if (!cfg.agentAccountId) throw new Error('API has no AGENT_ACCOUNT_ID — run create-agent and restart the API');
  if (!SUPPLIER) throw new Error('--supplier <account> is required');

  // Agent key permissions, read from chain.
  const keys = await rpc('query', { request_type: 'view_access_key_list', account_id: cfg.agentAccountId, finality: 'final' });
  const perms = keys.keys.map((k) => k.access_key.permission);
  const fcOnly = perms.length > 0 && perms.every((p) => p !== 'FullAccess' && p.FunctionCall?.receiver_id === cfg.vaultContractId && JSON.stringify(p.FunctionCall.method_names) === '["agent_pay"]');
  log(fcOnly, 'Agent account has only a function-call key: receiver=vault, methods=[agent_pay]', JSON.stringify(perms));

  let { hash } = await ownerAction('set_agent', { accountId: cfg.agentAccountId });
  log(true, 'Owner authorises agent account on-chain (set_agent)', explorer(hash));
  ({ hash } = await ownerAction('set_policy', { maxPerTx: USDC(2), dailyLimit: USDC(5) }));
  const onchainBiz = await view(cfg.vaultContractId, 'get_business', { business_id: state.onchainId });
  log(onchainBiz.max_per_tx === USDC(2) && onchainBiz.daily_limit === USDC(5), 'Owner sets policy on-chain: max 2 USDC per payment, 5 USDC per day', explorer(hash));

  let rec = (await must('GET', `${biz()}/recipients`)).recipients.find((r) => r.nearAccountId === SUPPLIER);
  if (!rec) rec = (await must('POST', `${biz()}/recipients`, { name: 'CloudDesk (test supplier)', nearAccountId: SUPPLIER, category: 'software' })).recipient;
  log(rec.storageRegistered === true, 'Recipient is registered with the USDC contract (NEP-145 checked live)');
  ({ hash } = await ownerAction('add_recipient', { accountId: SUPPLIER }));
  log(await view(cfg.vaultContractId, 'is_recipient_approved', { business_id: state.onchainId, account_id: SUPPLIER }), 'Owner approves recipient on-chain (add_recipient)', explorer(hash));

  // Deposit
  const before = BigInt(await view(cfg.vaultContractId, 'get_balance', { business_id: state.onchainId }));
  const dep = await must('POST', `${biz()}/treasury/deposit/prepare`, { amount: USDC(10) });
  hash = await signPrepared(dep.transaction);
  const depTx = (await must('POST', `${biz()}/treasury/submit`, { type: 'deposit', txHash: hash })).transaction;
  const afterDep = BigInt(await view(cfg.vaultContractId, 'get_balance', { business_id: state.onchainId }));
  log(depTx.status === 'confirmed' && afterDep - before === 10_000_000n, 'Deposit 10 USDC via ft_transfer_call; backend verified; vault balance +10', `${explorer(hash)} balance=${afterDep}`);

  // In-policy agent payment
  const small = await payExpense('Design tool subscription (e2e)', USDC(1.5), rec._id);
  log(small.proposal.decision === 'auto', 'Policy engine: 1.5 USDC to approved recipient → auto', small.proposal.decision);
  // In-policy proposals are executed by the agent signer at creation time.
  const exec = small.proposal;
  const execTx = (await must('GET', `${biz()}/payments/proposals/${small.proposal._id}`)).proposal.transactionId;
  const afterPay = BigInt(await view(cfg.vaultContractId, 'get_balance', { business_id: state.onchainId }));
  log(exec.status === 'completed' && execTx?.status === 'confirmed' && afterDep - afterPay === 1_500_000n, 'Agent pays 1.5 USDC with its function-call key; verified on-chain', `${execTx?.txHash ? explorer(execTx.txHash) : 'no tx'} status=${exec.status}`);
  state.agentPaymentId = execTx?.paymentId; save();

  // Duplicate prevention (API)
  const dup = await api('POST', `${biz()}/payments/proposals/${small.proposal._id}/execute`);
  log(dup.status >= 400, 'Re-executing the same proposal is refused by the API', `${dup.status} ${dup.data?.error?.code || ''}`);

  // Contract-level enforcement, bypassing the backend entirely (agent key, direct calls)
  const agentKey = cred(cfg.agentAccountId).private_key;
  const agent = new Account(cfg.agentAccountId, provider, agentKey);
  const direct = async (args) => {
    const r = await agent.signAndSendTransaction({ receiverId: cfg.vaultContractId, actions: [actions.functionCall('agent_pay', { business_id: state.onchainId, ...args }, 60_000_000_000_000n, 0n)], waitUntil: 'FINAL', throwOnFailure: false });
    const failure = r.status?.Failure;
    return { hash: r.transaction.hash, failed: !!failure, why: failure ? JSON.stringify(failure).slice(0, 160) : '' };
  };
  let d = await direct({ payment_id: state.agentPaymentId, recipient: SUPPLIER, amount: USDC(1), memo: 'replay' });
  log(d.failed, 'Contract rejects a replayed payment_id even when called directly with the agent key', `${explorer(d.hash)} ${d.why}`);
  d = await direct({ payment_id: `bzdirect${crypto.randomBytes(6).toString('hex')}`, recipient: SUPPLIER, amount: USDC(3), memo: 'over limit' });
  log(d.failed, 'Contract rejects an agent payment above max_per_tx (3 > 2 USDC)', `${explorer(d.hash)} ${d.why}`);
  d = await direct({ payment_id: `bzdirect${crypto.randomBytes(6).toString('hex')}`, recipient: OWNER, amount: USDC(1), memo: 'unapproved' });
  log(d.failed, 'Contract rejects an agent payment to a non-approved recipient', `${explorer(d.hash)} ${d.why}`);
  const tooMuch = await owner.signAndSendTransaction({ receiverId: cfg.vaultContractId, actions: [actions.functionCall('agent_pay', { business_id: state.onchainId, payment_id: 'bzowner0000001', recipient: SUPPLIER, amount: USDC(1), memo: 'not agent' }, 60_000_000_000_000n, 0n)], waitUntil: 'FINAL', throwOnFailure: false });
  log(!!tooMuch.status?.Failure, 'Contract rejects agent_pay from any account other than the authorised agent', explorer(tooMuch.transaction.hash));

  // Out-of-policy → owner approval
  const big = await payExpense('Quarterly hosting (e2e)', USDC(3), rec._id);
  log(big.proposal.decision === 'needs_approval', 'Policy engine: 3 USDC (> 2 max) → needs owner approval', big.proposal.decision);
  const approvals = (await must('GET', `${biz()}/approvals?status=pending`)).approvals;
  const appr = approvals.find((a) => String(a.proposalId) === String(big.proposal._id));
  log(!!appr, 'Approval record created and bound to recipient/amount/payment id', appr ? `email ${appr.emailStatus || appr.notification?.status || ''}` : '');
  const prep = await must('POST', `${biz()}/approvals/${appr._id}/prepare`);
  log(prep.transaction.methodName === 'owner_pay' && prep.transaction.args.amount === USDC(3), 'Approval prepares exactly owner_pay(3 USDC → supplier) for the owner wallet');
  hash = await signPrepared(prep.transaction);
  const apTx = (await must('POST', `${biz()}/approvals/${appr._id}/submit`, { txHash: hash })).transaction;
  log(apTx.status === 'confirmed', 'Owner signs owner_pay; backend verifies outcome + event + vault record before Paid', explorer(hash));
  const reuse = await api('POST', `${biz()}/approvals/${appr._id}/submit`, { txHash: depTx.txHash });
  log(reuse.status >= 400, 'Submitting an unrelated tx hash for the approval is refused', `${reuse.status} ${reuse.data?.error?.code || ''}`);

  // Revocation
  ({ hash } = await ownerAction('revoke_agent'));
  const revoked = await payExpense('Post-revoke attempt (e2e)', USDC(1), rec._id);
  const r2 = revoked.proposal.decision === 'auto' ? await api('POST', `${biz()}/payments/proposals/${revoked.proposal._id}/execute`) : { status: 409 };
  d = await direct({ payment_id: `bzdirect${crypto.randomBytes(6).toString('hex')}`, recipient: SUPPLIER, amount: USDC(1), memo: 'after revoke' });
  log(revoked.proposal.decision !== 'auto' && d.failed, 'After revoke_agent: policy no longer auto-pays and the contract rejects the agent key', `decision=${revoked.proposal.decision} exec=${r2.status} ${explorer(d.hash)}`);
  ({ hash } = await ownerAction('set_agent', { accountId: cfg.agentAccountId }));
  log(true, 'Owner re-authorises the agent for the demo', explorer(hash));
  if (revoked.expense?._id) await api('DELETE', `${biz()}/expenses/${revoked.expense._id}`);

  // Withdrawal
  const wd = await must('POST', `${biz()}/treasury/withdraw/prepare`, { amount: USDC(1) });
  hash = await signPrepared(wd.transaction);
  const wdTx = (await must('POST', `${biz()}/treasury/submit`, { type: 'withdrawal', txHash: hash, requestId: wd.requestId, amount: USDC(1) })).transaction;
  log(wdTx.status === 'confirmed', 'Owner withdraws 1 USDC; verified on-chain', explorer(hash));

  const t = await must('GET', `${biz()}/treasury`);
  console.log(`\nVault balance for ${state.onchainId}: ${t.balance ?? JSON.stringify(t)} (base units)`);
}

try {
  if (phase === 'setup') await setup(); else await flow();
} catch (e) {
  log(false, 'Unexpected error', e.message);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
