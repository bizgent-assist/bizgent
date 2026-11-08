// Payment proposals, approvals, agent execution and on-chain finalisation.
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import {
  Agent, AgentPolicy, Approval, Business, Expense, PaymentProposal, Recipient, Transaction, User,
} from '../../models/index.js';
import { ApiError } from '../../utils/errors.js';
import { formatUnits } from '../../utils/money.js';
import { audit } from '../audit.js';
import { chain } from '../near/chain.js';
import { verifyDeposit, verifyOutgoing } from '../near/verifier.js';
import { sendEmail } from '../notifications/index.js';
import { evaluatePayment } from './policy.js';

export const fmt = (units) => `${formatUnits(units, env.USDC_DECIMALS)} USDC`;
export const explorerTx = (hash) => `${env.explorerUrl}/txns/${hash}`;

export function newPaymentId(prefix = 'bz') {
  return `${prefix}${crypto.randomBytes(12).toString('hex')}`; // matches contract id rules
}

/** Binds an approval to the exact payment details. Any change â†’ different hash. */
export function detailsHash(d) {
  const canonical = JSON.stringify([
    env.NEAR_NETWORK, env.BIZGENT_CONTRACT_ID, d.businessOnchainId, d.paymentId,
    d.recipientAccountId, d.amount, d.asset, d.purpose,
  ]);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

const proposalHash = (business, p) => detailsHash({
  businessOnchainId: business.onchainId, paymentId: p.paymentId, recipientAccountId: p.recipientAccountId,
  amount: p.amount, asset: p.asset, purpose: p.purpose,
});

/** Collects the live on-chain facts the policy engine needs. Never throws. */
export async function gatherChainFacts(business, recipientAccountId) {
  const facts = { onchain: null, recipientApproved: null, recipientRegistered: null, chainError: null };
  if (!env.chainConfigured) { facts.chainError = 'vault contract not configured'; return facts; }
  try {
    const c = chain();
    const [onchain, approved, storage] = await Promise.all([
      c.getBusiness(business.onchainId),
      c.isRecipientApproved(business.onchainId, recipientAccountId),
      c.storageBalanceOf(recipientAccountId),
    ]);
    facts.onchain = onchain;
    facts.recipientApproved = approved;
    facts.recipientRegistered = storage !== null;
  } catch (err) {
    facts.chainError = err.message;
  }
  return facts;
}

async function evaluateFor(business, recipientAccountId, amount) {
  const [policy, agent, facts] = await Promise.all([
    AgentPolicy.findOne({ businessId: business._id }).lean(),
    Agent.findOne({ businessId: business._id }).lean(),
    gatherChainFacts(business, recipientAccountId),
  ]);
  return evaluatePayment({
    amount, policy, agent, agentSignerId: env.agentConfigured ? env.AGENT_ACCOUNT_ID : '', ...facts,
  });
}

/**
 * Creates a proposal from the user or the AI. The AI's input is untrusted: everything is
 * re-validated here, and the decision comes only from the deterministic policy engine.
 */
export async function createProposal({ business, user, source, recipientId, recipientAccountId, amount, purpose, expenseId, idempotencyKey, ip }) {
  if (idempotencyKey) {
    const existing = await PaymentProposal.findOne({ businessId: business._id, idempotencyKey });
    if (existing) return { proposal: existing, replayed: true };
  }

  let recipient = null;
  if (recipientId) {
    recipient = await Recipient.findOne({ _id: recipientId, businessId: business._id });
    if (!recipient) throw ApiError.badRequest('Recipient not found for this business');
  } else if (recipientAccountId) {
    recipient = await Recipient.findOne({ businessId: business._id, nearAccountId: recipientAccountId.toLowerCase() });
  }
  const account = recipient?.nearAccountId || recipientAccountId?.toLowerCase();
  if (!account) throw ApiError.badRequest('A recipient is required');

  let expense = null;
  if (expenseId) {
    expense = await Expense.findOne({ _id: expenseId, businessId: business._id });
    if (!expense) throw ApiError.badRequest('Expense not found for this business');
    if (expense.status === 'paid') throw ApiError.conflict('This expense is already paid', 'EXPENSE_ALREADY_PAID');
    const active = await PaymentProposal.findOne({
      businessId: business._id, expenseId: expense._id,
      status: { $in: ['proposed', 'awaiting_approval', 'executing', 'submitted'] },
    });
    if (active) throw ApiError.conflict('An active payment already exists for this expense', 'PAYMENT_IN_PROGRESS');
  }

  const evaluation = await evaluateFor(business, account, amount);
  const paymentId = newPaymentId();
  const base = {
    businessId: business._id, paymentId, idempotencyKey: idempotencyKey || undefined, source, createdBy: user._id,
    expenseId: expense?._id, recipientId: recipient?._id, recipientAccountId: account, recipientName: recipient?.name,
    amount, asset: env.USDC_CONTRACT_ID, purpose,
  };
  let proposal;
  try {
    proposal = await PaymentProposal.create({
      ...base,
      detailsHash: proposalHash(business, base),
      decision: evaluation.decision,
      decisionReasons: evaluation.reasons,
      status: evaluation.decision === 'rejected' ? 'rejected' : evaluation.decision === 'needs_approval' ? 'awaiting_approval' : 'proposed',
      executionMode: evaluation.decision === 'auto' ? 'agent' : evaluation.decision === 'needs_approval' ? 'owner' : null,
    });
  } catch (err) {
    if (err?.code === 11000 && idempotencyKey) {
      return { proposal: await PaymentProposal.findOne({ businessId: business._id, idempotencyKey }), replayed: true };
    }
    throw err;
  }

  await audit({
    businessId: business._id, actorType: source === 'ai' ? 'ai' : 'user', actorId: user._id, action: 'payment.proposed',
    entityType: 'PaymentProposal', entityId: proposal._id, ip,
    details: { amount, recipient: account, decision: evaluation.decision, reasons: evaluation.reasons },
  });

  if (evaluation.decision === 'needs_approval') {
    await createApproval(business, proposal, user);
  } else if (evaluation.decision === 'auto') {
    if (expense) await Expense.updateOne({ _id: expense._id }, { status: 'payment_pending' });
    await executeAgentPayment(business, proposal, user);
  }
  return { proposal: await PaymentProposal.findById(proposal._id), replayed: false };
}

async function createApproval(business, proposal, user) {
  const expiresAt = new Date(Date.now() + env.APPROVAL_TTL_MINUTES * 60_000);
  const approval = await Approval.create({
    businessId: business._id, proposalId: proposal._id, paymentId: proposal.paymentId,
    recipientAccountId: proposal.recipientAccountId, recipientName: proposal.recipientName,
    amount: proposal.amount, asset: proposal.asset, purpose: proposal.purpose,
    detailsHash: proposal.detailsHash, reasons: proposal.decisionReasons, expiresAt,
  });
  proposal.approvalId = approval._id;
  proposal.status = 'awaiting_approval';
  proposal.executionMode = 'owner';
  await proposal.save();
  const owner = await User.findById(business.ownerId);
  await sendEmail({
    template: 'approvalRequest', to: owner.email, toName: owner.name, businessId: business._id, userId: owner._id,
    related: { kind: 'Approval', id: approval._id },
    data: {
      name: owner.name, businessName: business.name, amount: fmt(proposal.amount),
      recipient: proposal.recipientName ? `${proposal.recipientName} (${proposal.recipientAccountId})` : proposal.recipientAccountId,
      purpose: proposal.purpose, reasons: proposal.decisionReasons, expiresAt: expiresAt.toUTCString(),
      link: `${env.FRONTEND_URL}/app/approvals/${approval._id}`,
    },
  });
  await audit({ businessId: business._id, actorType: 'system', action: 'approval.requested', entityType: 'Approval', entityId: approval._id, details: { paymentId: proposal.paymentId } });
  return approval;
}

/** Executes an `auto` proposal via the agent's restricted key. Exactly-once via atomic state transition. */
export async function executeAgentPayment(business, proposal, user) {
  const claimed = await PaymentProposal.findOneAndUpdate(
    { _id: proposal._id, status: 'proposed', decision: 'auto' },
    { $set: { status: 'executing' } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw ApiError.conflict('Payment is already being executed or is not eligible', 'ALREADY_EXECUTING');

  // Re-validate against live on-chain state immediately before signing.
  const recheck = await evaluateFor(business, claimed.recipientAccountId, claimed.amount);
  if (recheck.decision !== 'auto') {
    claimed.decision = recheck.decision;
    claimed.decisionReasons = recheck.reasons;
    if (recheck.decision === 'rejected') {
      claimed.status = 'rejected';
      await claimed.save();
      await Expense.updateOne({ _id: claimed.expenseId, status: 'payment_pending' }, { status: 'unpaid' });
      return claimed;
    }
    claimed.status = 'proposed';
    await claimed.save();
    await createApproval(business, claimed, user);
    return claimed;
  }

  let sent;
  try {
    sent = await chain().agentPay({
      businessId: business.onchainId, paymentId: claimed.paymentId, recipient: claimed.recipientAccountId,
      amount: claimed.amount, memo: claimed.purpose.slice(0, 140),
    });
  } catch (err) {
    // Nothing was broadcast with a known hash: safe to mark failed (contract prevents reuse of the id anyway).
    claimed.status = 'failed';
    claimed.error = `Agent signing/broadcast failed: ${err.message}`.slice(0, 400);
    await claimed.save();
    await Expense.updateOne({ _id: claimed.expenseId, status: 'payment_pending' }, { status: 'unpaid' });
    await audit({ businessId: business._id, actorType: 'agent', actorId: env.AGENT_ACCOUNT_ID, action: 'payment.agent_failed', entityType: 'PaymentProposal', entityId: claimed._id, details: { error: claimed.error } });
    return claimed;
  }

  const tx = await Transaction.create({
    businessId: business._id, type: 'agent_payment', amount: claimed.amount, asset: claimed.asset,
    counterparty: claimed.recipientAccountId, purpose: claimed.purpose, txHash: sent.txHash, signerId: sent.signerId,
    paymentId: claimed.paymentId, status: 'pending', expenseId: claimed.expenseId, proposalId: claimed._id, network: env.NEAR_NETWORK,
  });
  claimed.status = 'submitted';
  claimed.transactionId = tx._id;
  await claimed.save();
  await audit({ businessId: business._id, actorType: 'agent', actorId: sent.signerId, action: 'payment.agent_submitted', entityType: 'Transaction', entityId: tx._id, details: { txHash: sent.txHash, paymentId: claimed.paymentId } });
  await finalizeTransaction(tx);
  return PaymentProposal.findById(claimed._id);
}

// ------------------------------------------------------------------ approvals

export async function loadApproval(business, approvalId) {
  const approval = await Approval.findOne({ _id: approvalId, businessId: business._id });
  if (!approval) throw ApiError.notFound('Approval not found');
  if (approval.status === 'pending' && approval.expiresAt <= new Date()) {
    approval.status = 'expired';
    await approval.save();
    await PaymentProposal.updateOne({ _id: approval.proposalId }, { status: 'expired' });
  }
  return approval;
}

async function assertApprovalIntegrity(business, approval) {
  const proposal = await PaymentProposal.findOne({ _id: approval.proposalId, businessId: business._id });
  const recomputed = proposal && proposalHash(business, proposal);
  if (!proposal || proposal.detailsHash !== approval.detailsHash || recomputed !== approval.detailsHash
    || proposal.amount !== approval.amount || proposal.recipientAccountId !== approval.recipientAccountId) {
    approval.status = 'invalidated';
    await approval.save();
    throw ApiError.conflict('Payment details changed after approval was requested; approval invalidated', 'APPROVAL_INVALIDATED');
  }
  return proposal;
}

async function requireOwnerWallet(business, user) {
  if (!user.nearAccountId) throw ApiError.forbidden('Link your NEAR wallet before signing payments');
  if (!business.ownerNearAccountId || business.ownerNearAccountId !== user.nearAccountId) {
    throw ApiError.forbidden('Your linked wallet is not the on-chain owner of this business');
  }
}

/** Returns the exact owner_pay call the owner's wallet must sign. Nothing is executed here. */
export async function prepareApproval(business, user, approvalId) {
  const approval = await loadApproval(business, approvalId);
  if (approval.status !== 'pending') throw ApiError.conflict(`Approval is ${approval.status}`, 'APPROVAL_NOT_PENDING');
  await assertApprovalIntegrity(business, approval);
  await requireOwnerWallet(business, user);
  if (!env.chainConfigured) throw ApiError.unavailable('Vault contract not configured', 'CHAIN_NOT_CONFIGURED');
  return {
    approvalId: approval._id,
    expiresAt: approval.expiresAt,
    display: { amount: fmt(approval.amount), recipient: approval.recipientAccountId, purpose: approval.purpose },
    transaction: {
      receiverId: env.BIZGENT_CONTRACT_ID,
      signerId: user.nearAccountId,
      methodName: 'owner_pay',
      args: {
        business_id: business.onchainId, payment_id: approval.paymentId, recipient: approval.recipientAccountId,
        amount: approval.amount, memo: approval.purpose.slice(0, 140),
      },
      gas: String(BigInt(env.OWNER_PAY_GAS_TGAS) * 10n ** 12n),
      deposit: '1',
    },
  };
}

/** Owner submits the hash of the transaction their wallet signed. We verify it on-chain. */
export async function submitApprovalTx(business, user, approvalId, txHash, ip) {
  const approval = await loadApproval(business, approvalId);
  if (!['pending', 'executing'].includes(approval.status)) throw ApiError.conflict(`Approval is ${approval.status}`, 'APPROVAL_NOT_PENDING');
  const proposal = await assertApprovalIntegrity(business, approval);
  await requireOwnerWallet(business, user);

  const existing = await Transaction.findOne({ txHash, type: 'owner_payment' });
  if (existing && String(existing.businessId) !== String(business._id)) throw ApiError.conflict('Transaction hash already used', 'TX_REUSED');
  const tx = existing || await Transaction.create({
    businessId: business._id, type: 'owner_payment', amount: approval.amount, asset: approval.asset,
    counterparty: approval.recipientAccountId, purpose: approval.purpose, txHash, signerId: user.nearAccountId,
    paymentId: approval.paymentId, status: 'pending', expenseId: proposal.expenseId, approvalId: approval._id,
    proposalId: proposal._id, network: env.NEAR_NETWORK,
  });
  approval.status = 'executing';
  approval.decidedBy = user._id;
  approval.decidedAt = new Date();
  approval.transactionId = tx._id;
  await approval.save();
  proposal.status = 'submitted';
  proposal.transactionId = tx._id;
  await proposal.save();
  if (proposal.expenseId) await Expense.updateOne({ _id: proposal.expenseId, status: 'unpaid' }, { status: 'payment_pending' });
  await audit({ businessId: business._id, actorType: 'user', actorId: user._id, action: 'approval.signed', entityType: 'Approval', entityId: approval._id, ip, details: { txHash } });
  return finalizeTransaction(tx);
}

export async function rejectApproval(business, user, approvalId, note, ip) {
  const approval = await loadApproval(business, approvalId);
  if (approval.status !== 'pending') throw ApiError.conflict(`Approval is ${approval.status}`, 'APPROVAL_NOT_PENDING');
  approval.status = 'rejected';
  approval.decidedBy = user._id;
  approval.decidedAt = new Date();
  approval.decisionNote = note;
  await approval.save();
  await PaymentProposal.updateOne({ _id: approval.proposalId }, { status: 'rejected' });
  await audit({ businessId: business._id, actorType: 'user', actorId: user._id, action: 'approval.rejected', entityType: 'Approval', entityId: approval._id, ip, details: { note } });
  return approval;
}

/** Invalidates pending approvals tied to an expense whose payable details changed. */
export async function invalidateApprovalsForExpense(business, expenseId) {
  const proposals = await PaymentProposal.find({ businessId: business._id, expenseId, status: 'awaiting_approval' });
  for (const p of proposals) {
    await Approval.updateOne({ _id: p.approvalId, status: 'pending' }, { status: 'invalidated' });
    p.status = 'cancelled';
    await p.save();
  }
  return proposals.length;
}

// ------------------------------------------------------------------ verification

/** Verifies a pending transaction against the chain and propagates the result. Idempotent. */
export async function finalizeTransaction(tx) {
  if (tx.status !== 'pending') return tx;
  const business = await Business.findById(tx.businessId);
  let result;
  try {
    result = tx.type === 'deposit'
      ? await verifyDeposit(chain(), tx.txHash, { businessId: business.onchainId, signerId: tx.signerId })
      : await verifyOutgoing(chain(), tx.txHash, {
        kind: tx.type, businessId: business.onchainId, paymentId: tx.paymentId,
        recipient: tx.counterparty, amount: tx.amount, signerId: tx.signerId,
      });
  } catch (err) {
    result = { status: 'pending', reason: `Verification deferred: ${err.message}` };
  }
  tx.verificationAttempts += 1;
  tx.statusReason = result.reason;
  if (tx.type === 'deposit' && result.amount) {
    tx.amount = result.amount;
    if (result.sender) tx.counterparty = result.sender;
  }
  if (result.status === 'pending') {
    await tx.save();
    return tx;
  }
  tx.status = result.status;
  tx.verifiedAt = new Date();
  await tx.save();
  await audit({ businessId: tx.businessId, actorType: 'system', action: `transaction.${result.status}`, entityType: 'Transaction', entityId: tx._id, details: { txHash: tx.txHash, reason: result.reason } });

  if (tx.type === 'deposit' || tx.type === 'withdrawal') return tx;

  const proposal = tx.proposalId ? await PaymentProposal.findById(tx.proposalId) : null;
  const owner = await User.findById(business.ownerId);
  if (result.status === 'confirmed') {
    if (proposal) { proposal.status = 'completed'; await proposal.save(); }
    if (tx.approvalId) await Approval.updateOne({ _id: tx.approvalId }, { status: 'executed' });
    if (tx.expenseId) await Expense.updateOne({ _id: tx.expenseId, businessId: tx.businessId }, { status: 'paid', paidTransactionId: tx._id });
    await sendEmail({
      template: 'paymentConfirmed', to: owner.email, toName: owner.name, businessId: business._id, userId: owner._id,
      related: { kind: 'Transaction', id: tx._id },
      data: { name: owner.name, amount: fmt(tx.amount), recipient: tx.counterparty, purpose: tx.purpose, explorerLink: explorerTx(tx.txHash) },
    });
  } else {
    if (proposal) { proposal.status = 'failed'; proposal.error = result.reason; await proposal.save(); }
    if (tx.approvalId) await Approval.updateOne({ _id: tx.approvalId }, { status: 'failed' });
    if (tx.expenseId) await Expense.updateOne({ _id: tx.expenseId, status: 'payment_pending' }, { status: 'unpaid' });
    await sendEmail({
      template: 'paymentFailed', to: owner.email, toName: owner.name, businessId: business._id, userId: owner._id,
      related: { kind: 'Transaction', id: tx._id },
      data: { name: owner.name, amount: fmt(tx.amount), recipient: tx.counterparty, reason: result.reason, link: `${env.FRONTEND_URL}/app/transactions` },
    });
  }
  return tx;
}
