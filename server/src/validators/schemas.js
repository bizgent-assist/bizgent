import Joi from 'joi';
import { EXPENSE_CATEGORIES } from '../models/index.js';

const units = Joi.string().pattern(/^(0|[1-9]\d{0,37})$/).message('must be an integer base-unit string');
const positiveUnits = units.invalid('0');
const objectId = Joi.string().hex().length(24);
// NEAR account id rules (named + implicit 64-hex)
export const nearAccount = Joi.string().lowercase().max(64).pattern(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/).message('must be a valid NEAR account id');
const txHash = Joi.string().pattern(/^[1-9A-HJ-NP-Za-km-z]{32,64}$/).message('must be a base58 transaction hash');

export const s = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(10).max(128).required(),
    businessName: Joi.string().trim().min(2).max(120).required(),
  }),
  login: Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() }),
  forgot: Joi.object({ email: Joi.string().email().required() }),
  reset: Joi.object({ token: Joi.string().hex().length(64).required(), password: Joi.string().min(10).max(128).required() }),
  profile: Joi.object({ name: Joi.string().trim().min(2).max(100) }),
  changePassword: Joi.object({ currentPassword: Joi.string().required(), newPassword: Joi.string().min(10).max(128).required() }),
  walletVerify: Joi.object({
    accountId: nearAccount.required(),
    publicKey: Joi.string().pattern(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/).required(),
    // NEP-413 specifies base64; some wallets return "ed25519:<base58>". Both are accepted.
    signature: Joi.alternatives().try(Joi.string().base64(), Joi.string().pattern(/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/)).required(),
  }),

  business: Joi.object({
    name: Joi.string().trim().min(2).max(120),
    country: Joi.string().trim().max(60).allow(''),
    industry: Joi.string().trim().max(60).allow(''),
    contactEmail: Joi.string().email().allow(''),
  }),

  expenseCreate: Joi.object({
    title: Joi.string().trim().min(2).max(140).required(),
    description: Joi.string().trim().max(1000).allow(''),
    amount: positiveUnits.required(),
    category: Joi.string().valid(...EXPENSE_CATEGORIES).required(),
    recipientId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    recurring: Joi.string().valid('none', 'monthly', 'yearly'),
  }),
  expenseUpdate: Joi.object({
    title: Joi.string().trim().min(2).max(140),
    description: Joi.string().trim().max(1000).allow(''),
    amount: positiveUnits,
    category: Joi.string().valid(...EXPENSE_CATEGORIES),
    recipientId: objectId.allow(null),
    dueDate: Joi.date().iso().allow(null),
    recurring: Joi.string().valid('none', 'monthly', 'yearly'),
    status: Joi.string().valid('unpaid', 'cancelled'), // `paid` is never client-settable
  }).min(1),
  expenseQuery: Joi.object({
    status: Joi.string().valid('unpaid', 'payment_pending', 'paid', 'cancelled', 'outstanding'),
    category: Joi.string().valid(...EXPENSE_CATEGORIES),
    q: Joi.string().max(100),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
  }),

  recipientCreate: Joi.object({
    name: Joi.string().trim().min(2).max(120).required(),
    nearAccountId: nearAccount.required(),
    category: Joi.string().valid(...EXPENSE_CATEGORIES),
    email: Joi.string().email().allow(''),
    notes: Joi.string().max(500).allow(''),
  }),
  recipientUpdate: Joi.object({
    name: Joi.string().trim().min(2).max(120),
    category: Joi.string().valid(...EXPENSE_CATEGORIES),
    email: Joi.string().email().allow(''),
    notes: Joi.string().max(500).allow(''),
  }).min(1),

  agentUpdate: Joi.object({
    name: Joi.string().trim().max(60),
    status: Joi.string().valid('active', 'suspended'),
  }).min(1),
  policyUpdate: Joi.object({
    autoApproveBelow: units,
    requireApprovalForAll: Joi.boolean(),
    spendingAlertPercent: Joi.number().integer().min(0).max(100),
  }).min(1),
  chat: Joi.object({ message: Joi.string().trim().min(1).max(1000).required() }),

  proposal: Joi.object({
    recipientId: objectId,
    recipientAccountId: nearAccount,
    amount: positiveUnits.required(),
    purpose: Joi.string().trim().min(2).max(140).required(),
    expenseId: objectId.allow(null),
  }).or('recipientId', 'recipientAccountId'),
  txSubmit: Joi.object({ txHash: txHash.required() }),
  reject: Joi.object({ note: Joi.string().max(300).allow('') }),

  onchainPrepare: Joi.object({
    action: Joi.string().valid('register_business', 'set_policy', 'set_agent', 'revoke_agent', 'set_agent_paused', 'add_recipient', 'remove_recipient', 'storage_topup').required(),
    params: Joi.object({
      maxPerTx: units, dailyLimit: units, paused: Joi.boolean(), accountId: nearAccount,
    }).default({}),
  }),
  deposit: Joi.object({ amount: positiveUnits.required() }),
  withdraw: Joi.object({ amount: positiveUnits.required(), receiverId: nearAccount.allow(null, '') }),
  treasurySubmit: Joi.object({
    type: Joi.string().valid('deposit', 'withdrawal').required(),
    txHash: txHash.required(),
    requestId: Joi.string().pattern(/^[A-Za-z0-9_-]{6,64}$/),
    amount: positiveUnits,
    receiverId: nearAccount.allow(null, ''),
  }),
  txQuery: Joi.object({
    type: Joi.string().valid('deposit', 'withdrawal', 'agent_payment', 'owner_payment'),
    status: Joi.string().valid('pending', 'confirmed', 'failed', 'mismatch'),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};
