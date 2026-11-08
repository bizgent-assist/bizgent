import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { env } from '../config/env.js';
import { clearSession, issueSession, requireAuth, validate } from '../middleware/index.js';
import { Agent, AgentPolicy, Business, User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { chain } from '../services/near/chain.js';
import { sendEmail } from '../services/notifications/index.js';
import { ApiError } from '../utils/errors.js';
import { s } from '../validators/schemas.js';

const r = Router();
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

export function makeOnchainId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'biz';
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`;
}

export async function createBusinessFor(user, { name, ...rest }) {
  const business = await Business.create({ ownerId: user._id, name, ...rest, contactEmail: rest.contactEmail || user.email, onchainId: makeOnchainId(name), network: env.NEAR_NETWORK });
  await Agent.create({ businessId: business._id });
  await AgentPolicy.create({ businessId: business._id });
  return business;
}

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, nearAccountId: u.nearAccountId, walletLinkedAt: u.walletLinkedAt, createdAt: u.createdAt });

r.post('/register', validate(s.register), async (req, res) => {
  const { name, email, password, businessName } = req.body;
  if (await User.exists({ email: email.toLowerCase() })) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  const business = await createBusinessFor(user, { name: businessName });
  await audit({ businessId: business._id, actorType: 'user', actorId: user._id, action: 'user.registered', ip: req.ip });
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user), businesses: [business] });
});

r.post('/login', validate(s.login), async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
  if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  user.lastLoginAt = new Date();
  await user.save();
  issueSession(res, user);
  const businesses = await Business.find({ ownerId: user._id });
  res.json({ user: publicUser(user), businesses });
});

r.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  const businesses = await Business.find({ ownerId: req.user._id });
  res.json({ user: publicUser(req.user), businesses });
});

r.patch('/me', requireAuth, validate(s.profile), async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});

r.post('/change-password', requireAuth, validate(s.changePassword), async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw new ApiError(400, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  await user.save();
  res.json({ ok: true });
});

// Always responds 200 so the endpoint cannot be used to enumerate accounts.
r.post('/forgot-password', validate(s.forgot), async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60_000);
    await user.save();
    await sendEmail({
      template: 'passwordReset', to: user.email, toName: user.name, userId: user._id,
      data: { name: user.name, link: `${env.FRONTEND_URL}/reset-password?token=${token}` },
    });
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

r.post('/reset-password', validate(s.reset), async (req, res) => {
  const user = await User.findOne({ resetTokenHash: sha256(req.body.token), resetTokenExpiresAt: { $gt: new Date() } }).select('+resetTokenHash +resetTokenExpiresAt');
  if (!user) throw ApiError.badRequest('Reset link is invalid or has expired');
  user.passwordHash = await bcrypt.hash(req.body.password, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();
  res.json({ ok: true });
});

// ----------------------------------------------------------------- wallet linking (NEP-413)

const walletRecipient = () => new URL(env.FRONTEND_URL).host;
const walletMessage = (user) => `Link this NEAR account to ${env.APP_NAME} user ${user.email}`;

r.post('/wallet/challenge', requireAuth, async (req, res) => {
  const nonce = crypto.randomBytes(32);
  await User.updateOne({ _id: req.user._id }, { walletChallenge: { nonce: nonce.toString('base64'), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  res.json({ message: walletMessage(req.user), recipient: walletRecipient(), nonce: nonce.toString('base64'), network: env.NEAR_NETWORK });
});

r.post('/wallet/verify', requireAuth, validate(s.walletVerify), async (req, res) => {
  const { accountId, publicKey, signature } = req.body;
  const suffix = env.NEAR_NETWORK === 'testnet' ? '.testnet' : '.near';
  if (!accountId.endsWith(suffix) && !/^[0-9a-f]{64}$/.test(accountId)) throw ApiError.badRequest(`Account must be a ${env.NEAR_NETWORK} account`);
  const user = await User.findById(req.user._id).select('+walletChallenge.nonce +walletChallenge.expiresAt');
  const ch = user.walletChallenge;
  if (!ch?.nonce || !ch.expiresAt || ch.expiresAt < new Date()) throw ApiError.badRequest('Wallet challenge expired; request a new one');
  try {
    await chain().verifyNep413({
      accountId, publicKey, signatureBase64: signature, message: walletMessage(user), recipient: walletRecipient(),
      nonce: Uint8Array.from(Buffer.from(ch.nonce, 'base64')),
    });
  } catch (err) {
    throw new ApiError(400, 'WALLET_SIGNATURE_INVALID', `Wallet signature could not be verified: ${err.message}`);
  }
  const taken = await User.findOne({ nearAccountId: accountId, _id: { $ne: user._id } });
  if (taken) throw ApiError.conflict('This NEAR account is linked to another Bizgent user', 'WALLET_TAKEN');
  user.nearAccountId = accountId;
  user.walletLinkedAt = new Date();
  user.walletChallenge = undefined;
  await user.save();
  await audit({ actorType: 'user', actorId: user._id, action: 'wallet.linked', details: { accountId }, ip: req.ip });
  res.json({ user: publicUser(user) });
});

r.delete('/wallet', requireAuth, async (req, res) => {
  const old = req.user.nearAccountId;
  req.user.nearAccountId = null;
  req.user.walletLinkedAt = undefined;
  await req.user.save();
  await audit({ actorType: 'user', actorId: req.user._id, action: 'wallet.unlinked', details: { accountId: old }, ip: req.ip });
  res.json({ user: publicUser(req.user) });
});

export default r;
