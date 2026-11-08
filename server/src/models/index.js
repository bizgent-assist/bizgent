import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

// Money is ALWAYS a string of integer base units (e.g. USDC 6 decimals). Never a float.
const baseUnits = {
  type: String,
  required: true,
  validate: { validator: (v) => /^(0|[1-9]\d{0,37})$/.test(v), message: 'Invalid base-unit amount' },
};
const opts = { timestamps: true, versionKey: false };

export const EXPENSE_CATEGORIES = [
  'software', 'payroll', 'utilities', 'rent', 'marketing', 'suppliers', 'operations', 'other',
];

// ---------------------------------------------------------------- User
const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  nearAccountId: { type: String, default: null },
  walletLinkedAt: Date,
  walletChallenge: {
    nonce: { type: String, select: false },
    expiresAt: { type: Date, select: false },
  },
  resetTokenHash: { type: String, select: false },
  resetTokenExpiresAt: { type: Date, select: false },
  lastLoginAt: Date,
}, opts);
userSchema.index({ nearAccountId: 1 }, { unique: true, partialFilterExpression: { nearAccountId: { $type: 'string' } } });
userSchema.set('toJSON', {
  transform: (_d, r) => {
    delete r.passwordHash; delete r.walletChallenge; delete r.resetTokenHash; delete r.resetTokenExpiresAt;
    return r;
  },
});
export const User = model('User', userSchema);

// ---------------------------------------------------------------- Business
const businessSchema = new Schema({
  ownerId: { type: ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  country: { type: String, trim: true, maxlength: 60 },
  industry: { type: String, trim: true, maxlength: 60 },
  contactEmail: { type: String, lowercase: true, trim: true },
  onchainId: { type: String, required: true, unique: true }, // vault business_id
  network: { type: String, enum: ['testnet', 'mainnet'], required: true },
  onchainRegistered: { type: Boolean, default: false },
  ownerNearAccountId: { type: String, default: null }, // verified on-chain owner
}, opts);
export const Business = model('Business', businessSchema);

// ---------------------------------------------------------------- Recipient
const recipientSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nearAccountId: { type: String, required: true, trim: true, lowercase: true },
  category: { type: String, enum: EXPENSE_CATEGORIES, default: 'suppliers' },
  email: { type: String, lowercase: true, trim: true },
  notes: { type: String, maxlength: 500 },
  approvedOnChain: { type: Boolean, default: false },
  storageRegistered: { type: Boolean, default: null }, // null = unknown
  lastCheckedAt: Date,
}, opts);
recipientSchema.index({ businessId: 1, nearAccountId: 1 }, { unique: true });
export const Recipient = model('Recipient', recipientSchema);

// ---------------------------------------------------------------- Expense
const expenseSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, trim: true, maxlength: 1000 },
  amount: baseUnits,
  asset: { type: String, enum: ['USDC'], default: 'USDC' },
  category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
  recipientId: { type: ObjectId, ref: 'Recipient' },
  dueDate: Date,
  recurring: { type: String, enum: ['none', 'monthly', 'yearly'], default: 'none' },
  // `paid` is set ONLY by the transaction verifier after on-chain confirmation.
  status: { type: String, enum: ['unpaid', 'payment_pending', 'paid', 'cancelled'], default: 'unpaid' },
  paidTransactionId: { type: ObjectId, ref: 'Transaction' },
  createdBy: { type: ObjectId, ref: 'User' },
}, opts);
expenseSchema.index({ businessId: 1, status: 1, dueDate: 1 });
export const Expense = model('Expense', expenseSchema);

// ---------------------------------------------------------------- Agent + AgentPolicy
const agentSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, unique: true },
  name: { type: String, default: 'Bizgent Agent', maxlength: 60 },
  agentAccountId: { type: String, default: null }, // dedicated per-business agent account
  // Off-chain switch. The authoritative on-chain state is read live from the vault.
  status: { type: String, enum: ['not_configured', 'active', 'suspended', 'revoked'], default: 'not_configured' },
  lastSyncedAt: Date,
}, opts);
export const Agent = model('Agent', agentSchema);

const policySchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, unique: true },
  // Mirrors of on-chain limits (authoritative values live in the vault contract).
  maxPerTx: { ...baseUnits, default: '0' },
  dailyLimit: { ...baseUnits, default: '0' },
  // Backend-only tightening rules (can only make policy stricter than the contract).
  autoApproveBelow: { ...baseUnits, default: '0' },
  requireApprovalForAll: { type: Boolean, default: false },
  spendingAlertPercent: { type: Number, min: 0, max: 100, default: 80 },
  onchainSyncedAt: Date,
}, opts);
export const AgentPolicy = model('AgentPolicy', policySchema);

// ---------------------------------------------------------------- PaymentProposal
const proposalSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  paymentId: { type: String, required: true, unique: true }, // also the on-chain payment_id
  idempotencyKey: { type: String },
  source: { type: String, enum: ['ai', 'user'], required: true },
  createdBy: { type: ObjectId, ref: 'User', required: true },
  expenseId: { type: ObjectId, ref: 'Expense' },
  recipientId: { type: ObjectId, ref: 'Recipient' },
  recipientAccountId: { type: String, required: true },
  recipientName: String,
  amount: baseUnits,
  asset: { type: String, required: true }, // USDC token contract id
  purpose: { type: String, required: true, maxlength: 140 },
  detailsHash: { type: String, required: true },
  decision: { type: String, enum: ['auto', 'needs_approval', 'rejected'], required: true },
  decisionReasons: [String],
  status: {
    type: String,
    enum: ['proposed', 'awaiting_approval', 'executing', 'submitted', 'completed', 'failed', 'rejected', 'expired', 'cancelled'],
    default: 'proposed',
  },
  executionMode: { type: String, enum: ['agent', 'owner', null], default: null },
  approvalId: { type: ObjectId, ref: 'Approval' },
  transactionId: { type: ObjectId, ref: 'Transaction' },
  error: String,
}, opts);
proposalSchema.index({ businessId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export const PaymentProposal = model('PaymentProposal', proposalSchema);

// ---------------------------------------------------------------- Approval
const approvalSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  proposalId: { type: ObjectId, ref: 'PaymentProposal', required: true, unique: true },
  // Snapshot of the exact details the owner is approving; bound by detailsHash.
  paymentId: { type: String, required: true },
  recipientAccountId: { type: String, required: true },
  recipientName: String,
  amount: baseUnits,
  asset: { type: String, required: true },
  purpose: { type: String, required: true },
  detailsHash: { type: String, required: true },
  reasons: [String],
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'executing', 'executed', 'rejected', 'expired', 'invalidated', 'failed'], default: 'pending' },
  decidedBy: { type: ObjectId, ref: 'User' },
  decidedAt: Date,
  decisionNote: String,
  transactionId: { type: ObjectId, ref: 'Transaction' },
}, opts);
export const Approval = model('Approval', approvalSchema);

// ---------------------------------------------------------------- Transaction
const transactionSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'agent_payment', 'owner_payment'], required: true },
  amount: { ...baseUnits, required: false },
  asset: { type: String, required: true },
  counterparty: String, // recipient (outgoing) or sender (deposit)
  purpose: String,
  txHash: { type: String, required: true },
  signerId: { type: String, required: true },
  paymentId: String,
  // `confirmed` only after the verifier inspects the actual on-chain outcome.
  status: { type: String, enum: ['pending', 'confirmed', 'failed', 'mismatch'], default: 'pending' },
  statusReason: String,
  expenseId: { type: ObjectId, ref: 'Expense' },
  approvalId: { type: ObjectId, ref: 'Approval' },
  proposalId: { type: ObjectId, ref: 'PaymentProposal' },
  verifiedAt: Date,
  verificationAttempts: { type: Number, default: 0 },
  network: { type: String, required: true },
}, opts);
transactionSchema.index({ txHash: 1, type: 1 }, { unique: true });
transactionSchema.index({ businessId: 1, createdAt: -1 });
export const Transaction = model('Transaction', transactionSchema);

// ---------------------------------------------------------------- Notification
const notificationSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', index: true },
  userId: { type: ObjectId, ref: 'User' },
  channel: { type: String, enum: ['email', 'whatsapp'], default: 'email' },
  template: { type: String, required: true },
  to: { type: String, required: true },
  subject: String,
  providerMessageId: { type: String, index: true },
  // `sent` means Brevo ACCEPTED the request — not that it was delivered.
  status: { type: String, enum: ['queued', 'sent', 'delivered', 'opened', 'failed', 'bounced', 'skipped'], default: 'queued' },
  error: String,
  related: { kind: String, id: ObjectId },
}, opts);
export const Notification = model('Notification', notificationSchema);

// ---------------------------------------------------------------- Chat
const chatSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', required: true, index: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, maxlength: 8000 },
  proposalIds: [{ type: ObjectId, ref: 'PaymentProposal' }],
  toolTrace: [{ name: String, ok: Boolean, _id: false }],
  model: String,
  usage: { promptTokens: Number, completionTokens: Number },
}, opts);
chatSchema.index({ businessId: 1, createdAt: -1 });
export const ChatMessage = model('ChatMessage', chatSchema);

// ---------------------------------------------------------------- AuditLog (append-only)
const auditSchema = new Schema({
  businessId: { type: ObjectId, ref: 'Business', index: true },
  actorType: { type: String, enum: ['user', 'ai', 'agent', 'system'], required: true },
  actorId: String,
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  details: Schema.Types.Mixed,
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne']) {
  auditSchema.pre(op, function blockMutation() {
    throw new Error('AuditLog is append-only');
  });
}
export const AuditLog = model('AuditLog', auditSchema);
