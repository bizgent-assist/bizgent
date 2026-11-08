// Treasury + on-chain owner actions. The backend only PREPARES transactions for the owner's
// wallet to sign and then VERIFIES the resulting hashes. It never signs for the owner.
import { env } from '../../config/env.js';
import { Agent, AgentPolicy, Business, Recipient, Transaction } from '../../models/index.js';
import { ApiError } from '../../utils/errors.js';
import { isBaseUnits } from '../../utils/money.js';
import { audit } from '../audit.js';
import { chain } from '../near/chain.js';
import { finalizeTransaction, newPaymentId } from './payments.service.js';

const TGAS = 10n ** 12n;
const gas = (t) => String(BigInt(t) * TGAS);
const ONE_YOCTO = '1';
export const REGISTRATION_DEPOSIT_YOCTO = '100000000000000000000000'; // 0.1 NEAR (contract minimum is 0.05)

function requireChain() {
  if (!env.chainConfigured) throw ApiError.unavailable('Vault contract not configured (BIZGENT_CONTRACT_ID)', 'CHAIN_NOT_CONFIGURED');
}
function requireWallet(user) {
  if (!user.nearAccountId) throw ApiError.forbidden('Link your NEAR wallet first');
}
function requireOwner(business, user) {
  requireWallet(user);
  if (business.onchainRegistered && business.ownerNearAccountId !== user.nearAccountId) {
    throw ApiError.forbidden('Your linked wallet is not the on-chain owner of this business');
  }
}

/** Live treasury view. On RPC failure this throws (503) — never a fabricated zero. */
export async function getTreasury(business) {
  const base = {
    network: env.NEAR_NETWORK, vaultContractId: env.BIZGENT_CONTRACT_ID || null, usdcContractId: env.USDC_CONTRACT_ID,
    decimals: env.USDC_DECIMALS, onchainId: business.onchainId, registered: business.onchainRegistered,
  };
  requireChain();
  const onchain = await chain().getBusiness(business.onchainId);
  if (!onchain) return { ...base, registered: false, onchain: null, source: 'chain', fetchedAt: new Date() };
  return { ...base, onchain, source: 'chain', fetchedAt: new Date() };
}

/** ----------------------------------------------------------------- owner actions */

const OWNER_ACTIONS = {
  register_business: (b) => ({ methodName: 'register_business', args: { business_id: b.onchainId }, deposit: REGISTRATION_DEPOSIT_YOCTO, gas: gas(50) }),
  set_policy: (b, p) => {
    if (!isBaseUnits(p.maxPerTx) || !isBaseUnits(p.dailyLimit)) throw ApiError.badRequest('Limits must be base-unit strings');
    if (BigInt(p.maxPerTx) > BigInt(p.dailyLimit)) throw ApiError.badRequest('Per-transaction limit cannot exceed daily limit');
    return { methodName: 'set_policy', args: { business_id: b.onchainId, max_per_tx: p.maxPerTx, daily_limit: p.dailyLimit }, deposit: ONE_YOCTO, gas: gas(30) };
  },
  set_agent: (b) => {
    if (!env.AGENT_ACCOUNT_ID) throw ApiError.unavailable('AGENT_ACCOUNT_ID is not configured', 'AGENT_NOT_CONFIGURED');
    return { methodName: 'set_agent', args: { business_id: b.onchainId, agent_id: env.AGENT_ACCOUNT_ID }, deposit: ONE_YOCTO, gas: gas(30) };
  },
  revoke_agent: (b) => ({ methodName: 'revoke_agent', args: { business_id: b.onchainId }, deposit: ONE_YOCTO, gas: gas(30) }),
  set_agent_paused: (b, p) => ({ methodName: 'set_agent_paused', args: { business_id: b.onchainId, paused: Boolean(p.paused) }, deposit: ONE_YOCTO, gas: gas(30) }),
  add_recipient: (b, p) => ({ methodName: 'add_recipient', args: { business_id: b.onchainId, account_id: p.accountId }, deposit: ONE_YOCTO, gas: gas(30) }),
  remove_recipient: (b, p) => ({ methodName: 'remove_recipient', args: { business_id: b.onchainId, account_id: p.accountId }, deposit: ONE_YOCTO, gas: gas(30) }),
  storage_topup: (b) => ({ methodName: 'storage_topup', args: { business_id: b.onchainId }, deposit: '50000000000000000000000', gas: gas(30) }),
};

export function prepareOwnerAction(business, user, action, params = {}) {
  requireChain();
  if (action === 'register_business') requireWallet(user); else requireOwner(business, user);
  const build = OWNER_ACTIONS[action];
  if (!build) throw ApiError.badRequest('Unknown on-chain action');
  return { transaction: { receiverId: env.BIZGENT_CONTRACT_ID, signerId: user.nearAccountId, ...build(business, params) } };
}

/** Re-reads authoritative on-chain state and refreshes local mirrors. */
export async function syncFromChain(business, user) {
  requireChain();
  const c = chain();
  const onchain = await c.getBusiness(business.onchainId);
  if (!onchain) return { registered: false };
  if (!user.nearAccountId || onchain.owner !== user.nearAccountId) {
    throw ApiError.forbidden(`On-chain owner is ${onchain.owner}; link that wallet to manage this business`);
  }
  const changed = !business.onchainRegistered;
  business.onchainRegistered = true;
  business.ownerNearAccountId = onchain.owner;
  await business.save();
  await AgentPolicy.updateOne(
    { businessId: business._id },
    { $set: { maxPerTx: onchain.max_per_tx, dailyLimit: onchain.daily_limit, onchainSyncedAt: new Date() } },
    { upsert: true },
  );
  const agentUpdate = { agentAccountId: onchain.agent || null, lastSyncedAt: new Date() };
  const agent = await Agent.findOne({ businessId: business._id });
  if (!onchain.agent && agent?.status === 'active') agentUpdate.status = 'revoked';
  if (onchain.agent && (!agent || ['not_configured', 'revoked'].includes(agent.status))) agentUpdate.status = 'active';
  await Agent.updateOne({ businessId: business._id }, { $set: agentUpdate }, { upsert: true });
  const recipients = await Recipient.find({ businessId: business._id });
  await Promise.all(recipients.map(async (r) => {
    const [approved, storage] = await Promise.all([
      c.isRecipientApproved(business.onchainId, r.nearAccountId),
      c.storageBalanceOf(r.nearAccountId).catch(() => undefined),
    ]);
    r.approvedOnChain = approved;
    if (storage !== undefined) r.storageRegistered = storage !== null;
    r.lastCheckedAt = new Date();
    await r.save();
  }));
  if (changed) await audit({ businessId: business._id, actorType: 'user', actorId: user._id, action: 'business.registered_onchain', details: { owner: onchain.owner } });
  return { registered: true, onchain };
}

/** ----------------------------------------------------------------- deposits / withdrawals */

export function prepareDeposit(business, user, amount) {
  requireChain();
  requireWallet(user);
  if (!business.onchainRegistered) throw ApiError.conflict('Register the business on-chain first', 'NOT_REGISTERED');
  if (!isBaseUnits(amount) || amount === '0') throw ApiError.badRequest('Invalid amount');
  return {
    transaction: {
      receiverId: env.USDC_CONTRACT_ID,
      signerId: user.nearAccountId,
      methodName: 'ft_transfer_call',
      args: { receiver_id: env.BIZGENT_CONTRACT_ID, amount, msg: JSON.stringify({ business_id: business.onchainId }) },
      deposit: ONE_YOCTO,
      gas: gas(100),
    },
  };
}

export function prepareWithdraw(business, user, amount, receiverId) {
  requireChain();
  requireOwner(business, user);
  if (!isBaseUnits(amount) || amount === '0') throw ApiError.badRequest('Invalid amount');
  const requestId = newPaymentId('wd');
  return {
    requestId,
    transaction: {
      receiverId: env.BIZGENT_CONTRACT_ID,
      signerId: user.nearAccountId,
      methodName: 'withdraw',
      args: { business_id: business.onchainId, request_id: requestId, amount, receiver_id: receiverId || null },
      deposit: ONE_YOCTO,
      gas: gas(env.OWNER_PAY_GAS_TGAS),
    },
  };
}

/** Records a wallet-signed deposit/withdrawal hash and verifies it on-chain. */
export async function submitTreasuryTx(business, user, { type, txHash, requestId, amount, receiverId }, ip) {
  requireChain();
  requireWallet(user);
  const existing = await Transaction.findOne({ txHash, type });
  if (existing) {
    if (String(existing.businessId) !== String(business._id)) throw ApiError.conflict('Transaction hash already used', 'TX_REUSED');
    return finalizeTransaction(existing);
  }
  const doc = {
    businessId: business._id, type, asset: env.USDC_CONTRACT_ID, txHash, signerId: user.nearAccountId,
    status: 'pending', network: env.NEAR_NETWORK,
  };
  if (type === 'withdrawal') {
    requireOwner(business, user);
    if (!requestId || !isBaseUnits(amount)) throw ApiError.badRequest('requestId and amount are required for withdrawals');
    Object.assign(doc, { paymentId: requestId, amount, counterparty: receiverId || user.nearAccountId, purpose: 'Owner withdrawal' });
  } else {
    Object.assign(doc, { counterparty: user.nearAccountId, purpose: 'Treasury deposit' });
  }
  const tx = await Transaction.create(doc);
  await audit({ businessId: business._id, actorType: 'user', actorId: user._id, action: `treasury.${type}_submitted`, entityType: 'Transaction', entityId: tx._id, ip, details: { txHash } });
  return finalizeTransaction(tx);
}

/** Re-verifies pending transactions (called on demand and by the periodic job). */
export async function reverifyPending(businessId) {
  const q = { status: 'pending', verificationAttempts: { $lt: 60 } };
  if (businessId) q.businessId = businessId;
  const pending = await Transaction.find(q).limit(25);
  for (const tx of pending) await finalizeTransaction(tx);
  return pending.length;
}

export async function businessById(id) {
  return Business.findById(id);
}
