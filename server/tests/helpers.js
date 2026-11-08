// Test harness: env must be set BEFORE any app module is imported.
import crypto from 'node:crypto';
import { ApiError } from '../src/utils/errors.js';

export const VAULT = 'vault.bizgent.testnet';
export const USDC = '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
export const AGENT = 'agent.bizgent.testnet';

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_BASE_URL: 'http://localhost:4000',
  FRONTEND_URL: 'http://localhost:5173',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://placeholder',
  JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
  NEAR_NETWORK: 'testnet',
  NEAR_RPC_URL: 'https://rpc.invalid',
  BIZGENT_CONTRACT_ID: VAULT,
  USDC_CONTRACT_ID: USDC,
  AGENT_ACCOUNT_ID: AGENT,
  AGENT_PRIVATE_KEY: 'ed25519:test',
  BREVO_API_KEY: 'test',
  BREVO_SENDER_EMAIL: 'sender@example.com',
  AI_PROVIDER: 'near-ai',
  AI_API_KEY: '',
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const hash = () => crypto.randomBytes(32).toString('hex').slice(0, 44).replace(/[0OIl]/g, 'A');

/** In-memory simulation of the vault + USDC contract, enforcing the same rules as the Rust contract. */
export function createMockChain() {
  const m = {
    vaultId: VAULT,
    usdcId: USDC,
    businesses: new Map(),
    approved: new Set(),
    registered: new Set(),
    payments: new Map(),
    txs: new Map(),
    failTransfers: false,
    down: false,
  };
  const guard = () => { if (m.down) throw ApiError.unavailable('NEAR RPC view failed: down', 'CHAIN_UNAVAILABLE'); };
  const event = (event, data) => `EVENT_JSON:${JSON.stringify({ standard: 'bizgent', version: '1.0.0', event, data: [data] })}`;

  m.addBusiness = (id, owner, overrides = {}) => m.businesses.set(id, {
    business_id: id, owner, balance: '0', agent: AGENT, agent_paused: false, max_per_tx: '5000000', daily_limit: '20000000',
    spent_today: '0', remaining_today: '20000000', recipient_count: 0, storage_balance: '1', created_at: 0, ...overrides,
  });
  m.getConfig = async () => ({ admin: 'admin.testnet', usdc_contract_id: USDC, paused: false });
  m.getBusiness = async (id) => { guard(); return m.businesses.get(id) ?? null; };
  m.isRecipientApproved = async (id, acc) => { guard(); return m.approved.has(`${id}|${acc}`); };
  m.storageBalanceOf = async (acc) => { guard(); return m.registered.has(acc) ? { total: '1', available: '0' } : null; };
  m.getPayment = async (id, pid) => m.payments.get(`${id}:${pid}`) ?? null;
  m.getTx = async (h) => m.txs.get(h) ?? null;
  m.ftMetadata = async () => ({ decimals: 6, symbol: 'USDC' });

  function transfer(kind, signer, method, args, idField) {
    const biz = m.businesses.get(args.business_id);
    const h = hash();
    const logs = [];
    const pid = args[idField];
    const recipient = args.recipient ?? args.receiver_id ?? signer;
    let failure = null;
    if (!biz) failure = 'Unknown business';
    else if (m.payments.has(`${args.business_id}:${pid}`)) failure = 'Duplicate payment_id';
    else if (BigInt(biz.balance) < BigInt(args.amount)) failure = 'Insufficient business balance';
    if (!failure) {
      const ok = !m.failTransfers && m.registered.has(recipient);
      if (ok) biz.balance = (BigInt(biz.balance) - BigInt(args.amount)).toString();
      m.payments.set(`${args.business_id}:${pid}`, { business_id: args.business_id, payment_id: pid, kind, recipient, amount: args.amount, status: ok ? 'Completed' : 'Failed', signer });
      logs.push(event(ok ? 'payment_completed' : 'payment_failed', { business_id: args.business_id, payment_id: pid, recipient, amount: args.amount }));
    }
    m.txs.set(h, {
      status: failure ? { Failure: { ActionError: { kind: { FunctionCallError: { ExecutionError: failure } } } } } : { SuccessValue: '' },
      transaction: { hash: h, signer_id: signer, receiver_id: VAULT, actions: [{ FunctionCall: { method_name: method, args: b64(args), deposit: kind === 'AgentPayment' ? '0' : '1' } }] },
      receipts_outcome: [{ outcome: { executor_id: VAULT, logs } }],
    });
    return h;
  }

  /** Agent signing path: applies the same checks the contract applies in agent_pay. */
  m.agentPay = async ({ businessId, paymentId, recipient, amount, memo }) => {
    const biz = m.businesses.get(businessId);
    const args = { business_id: businessId, payment_id: paymentId, recipient, amount, memo };
    const reject = !biz || biz.agent !== AGENT || biz.agent_paused || !m.approved.has(`${businessId}|${recipient}`)
      || BigInt(amount) > BigInt(biz.max_per_tx) || BigInt(amount) > BigInt(biz.remaining_today);
    if (reject) {
      const h = hash();
      m.txs.set(h, { status: { Failure: { ActionError: 'policy' } }, transaction: { hash: h, signer_id: AGENT, receiver_id: VAULT, actions: [{ FunctionCall: { method_name: 'agent_pay', args: b64(args), deposit: '0' } }] }, receipts_outcome: [] });
      return { txHash: h, signerId: AGENT };
    }
    biz.remaining_today = (BigInt(biz.remaining_today) - BigInt(amount)).toString();
    return { txHash: transfer('AgentPayment', AGENT, 'agent_pay', args, 'payment_id'), signerId: AGENT };
  };
  /** Simulates the owner's wallet signing a vault call. */
  m.ownerSigns = (signer, method, args) => transfer(method === 'withdraw' ? 'Withdrawal' : 'OwnerPayment', signer, method, args, method === 'withdraw' ? 'request_id' : 'payment_id');
  m.ownerDeposits = (signer, businessId, amount, { target = VAULT, credit = true } = {}) => {
    const h = hash();
    const logs = [];
    const biz = m.businesses.get(businessId);
    if (credit && biz && target === VAULT) {
      biz.balance = (BigInt(biz.balance) + BigInt(amount)).toString();
      logs.push(event('deposit', { business_id: businessId, sender_id: signer, amount, balance: biz.balance }));
    }
    m.txs.set(h, {
      status: { SuccessValue: '' },
      transaction: { hash: h, signer_id: signer, receiver_id: USDC, actions: [{ FunctionCall: { method_name: 'ft_transfer_call', args: b64({ receiver_id: target, amount, msg: JSON.stringify({ business_id: businessId }) }), deposit: '1' } }] },
      receipts_outcome: [{ outcome: { executor_id: VAULT, logs } }],
    });
    return h;
  };
  m.verifyNep413 = async ({ signatureBase64 }) => { if (signatureBase64 !== Buffer.from('valid').toString('base64')) throw new Error('bad sig'); return true; };
  m.accessKeyPermission = async () => 'FullAccess';
  return m;
}
