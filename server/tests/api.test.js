import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT, USDC, VAULT, createMockChain } from './helpers.js';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;
const { createApp } = await import('../src/app.js');
const { setChainClient } = await import('../src/services/near/chain.js');
const { setEmailTransport } = await import('../src/services/notifications/index.js');
const { setAiProvider } = await import('../src/services/ai/ai.provider.js');
const models = await import('../src/models/index.js');

let mongod;
let app;
let mock;
const sent = [];

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('bizgent-test'));
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init())); // unique indexes ready
  app = createApp();
  setEmailTransport(async (m) => { sent.push(m); return { messageId: `msg-${sent.length}` }; });
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  mock = createMockChain();
  setChainClient(mock);
  setAiProvider(null);
  sent.length = 0;
});

const H = { 'x-requested-with': 'bizgent' };

/** Registers a user, links wallet, registers business on-chain (mock), sets up agent + recipient. */
async function setupOwner(email = 'owner@example.com', wallet = 'owner.testnet') {
  const agent = request.agent(app);
  const reg = await agent.post('/api/v1/auth/register').set(H).send({ name: 'Ada Owner', email, password: 'correct-horse-battery', businessName: 'Acme Ltd' });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const business = reg.body.businesses[0];
  await agent.post('/api/v1/auth/wallet/challenge').set(H).expect(200);
  await agent.post('/api/v1/auth/wallet/verify').set(H)
    .send({ accountId: wallet, publicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp', signature: Buffer.from('valid').toString('base64') })
    .expect(200);
  mock.addBusiness(business.onchainId, wallet, { balance: '100000000' }); // 100 USDC
  const sync = await agent.post(`/api/v1/businesses/${business._id}/onchain/sync`).set(H);
  assert.equal(sync.status, 200, JSON.stringify(sync.body));
  const rec = await agent.post(`/api/v1/businesses/${business._id}/recipients`).set(H).send({ name: 'CloudSoft', nearAccountId: 'cloudsoft.testnet', category: 'software' });
  mock.approved.add(`${business.onchainId}|cloudsoft.testnet`);
  mock.registered.add('cloudsoft.testnet');
  await agent.post(`/api/v1/businesses/${business._id}/onchain/sync`).set(H).expect(200);
  return { agent, business, base: `/api/v1/businesses/${business._id}`, recipientId: rec.body.recipient._id, wallet };
}

const propose = (o, body, key = `k-${Math.random().toString(36).slice(2, 12)}`) =>
  o.agent.post(`${o.base}/payments/proposals`).set(H).set('idempotency-key', key).send(body);

describe('money utilities', () => {
  test('parse and format base units without floats', async () => {
    const { parseDecimal, formatUnits } = await import('../src/utils/money.js');
    assert.equal(parseDecimal('15', 6), '15000000');
    assert.equal(parseDecimal('0.1', 6), '100000');
    assert.equal(parseDecimal('1,250.50', 6), '1250500000');
    assert.throws(() => parseDecimal('0.0000001', 6), /decimal places/);
    assert.throws(() => parseDecimal('-1', 6));
    assert.equal(formatUnits('1250500000', 6), '1250.50');
    assert.equal(formatUnits('1', 6), '0.000001');
    assert.equal(formatUnits('123456789012345678901234567890', 6), '123456789012345678901234.56789'); // lossless; trailing zeros trimmed
  });
});

describe('auth and security', () => {
  test('state-changing requests require the CSRF header', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    assert.equal(res.status, 403);
  });
  test('register, me, logout, wrong password', async () => {
    const o = await setupOwner();
    const me = await o.agent.get('/api/v1/auth/me').expect(200);
    assert.equal(me.body.user.nearAccountId, 'owner.testnet');
    assert.equal(me.body.user.passwordHash, undefined);
    await o.agent.post('/api/v1/auth/logout').set(H).expect(200);
    await o.agent.get('/api/v1/auth/me').expect(401);
    await request(app).post('/api/v1/auth/login').set(H).send({ email: 'owner@example.com', password: 'wrong-password' }).expect(401);
  });
  test('invalid wallet signature is rejected', async () => {
    const a = request.agent(app);
    await a.post('/api/v1/auth/register').set(H).send({ name: 'Bob', email: 'b@example.com', password: 'correct-horse-battery', businessName: 'Bob Co' }).expect(201);
    await a.post('/api/v1/auth/wallet/challenge').set(H).expect(200);
    const r = await a.post('/api/v1/auth/wallet/verify').set(H).send({ accountId: 'bob.testnet', publicKey: 'ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp', signature: Buffer.from('forged').toString('base64') });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'WALLET_SIGNATURE_INVALID');
  });
  test('forgot-password does not reveal whether an account exists', async () => {
    const r = await request(app).post('/api/v1/auth/forgot-password').set(H).send({ email: 'nobody@example.com' }).expect(200);
    assert.match(r.body.message, /If an account exists/);
  });
});

describe('business isolation', () => {
  test("user B cannot read or act on business A's records", async () => {
    const a = await setupOwner('a@example.com', 'alice.testnet');
    const bOwner = await setupOwner('b@example.com', 'bob.testnet');
    for (const path of ['', '/expenses', '/treasury', '/approvals', '/transactions', '/recipients', '/agent', '/dashboard']) {
      const r = await bOwner.agent.get(`${a.base}${path}`);
      assert.equal(r.status, 404, `GET ${path} should be 404, got ${r.status}`);
    }
    const r = await propose(bOwner, { recipientId: a.recipientId, amount: '1000000', purpose: 'steal' }).set('x-requested-with', 'bizgent');
    assert.equal(r.status, 400); // recipient id belongs to another business
    const r2 = await bOwner.agent.post(`${a.base}/treasury/withdraw/prepare`).set(H).send({ amount: '1000000' });
    assert.equal(r2.status, 404);
  });
});

describe('expenses', () => {
  test('client cannot mark an expense paid; amounts must be integer base units', async () => {
    const o = await setupOwner();
    const bad = await o.agent.post(`${o.base}/expenses`).set(H).send({ title: 'Bad', amount: '15.5', category: 'software' });
    assert.equal(bad.status, 400);
    const e = await o.agent.post(`${o.base}/expenses`).set(H).send({ title: 'Figma', amount: '15000000', category: 'software', recipientId: o.recipientId }).expect(201);
    const upd = await o.agent.patch(`${o.base}/expenses/${e.body.expense._id}`).set(H).send({ status: 'paid' });
    assert.equal(upd.status, 400);
  });
});

describe('payments', () => {
  test('approved recipient within limits: agent executes and verifier confirms on-chain', async () => {
    const o = await setupOwner();
    const e = await o.agent.post(`${o.base}/expenses`).set(H).send({ title: 'Software subscription', amount: '1500000', category: 'software', recipientId: o.recipientId }).expect(201);
    const r = await propose(o, { recipientId: o.recipientId, amount: '1500000', purpose: 'Monthly software subscription', expenseId: e.body.expense._id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.proposal.decision, 'auto');
    assert.equal(r.body.proposal.status, 'completed');
    const tx = await models.Transaction.findById(r.body.proposal.transactionId);
    assert.equal(tx.status, 'confirmed');
    assert.equal(tx.signerId, AGENT);
    const exp = await models.Expense.findById(e.body.expense._id);
    assert.equal(exp.status, 'paid');
    assert.ok(sent.some((m) => /Payment confirmed/.test(m.subject)));
  });

  test('2 USDC payment with a 1 USDC per-transaction limit does not auto-execute', async () => {
    const o = await setupOwner();
    mock.businesses.get(o.business.onchainId).max_per_tx = '1000000';
    const r = await propose(o, { recipientId: o.recipientId, amount: '2000000', purpose: 'Over limit' });
    assert.equal(r.body.proposal.decision, 'needs_approval');
    assert.ok(r.body.proposal.decisionReasons.some((x) => /per-transaction/.test(x)));
    assert.equal(await models.Transaction.countDocuments(), 0);
    assert.ok(sent.some((m) => /Approval needed/.test(m.subject)));
    assert.ok(sent.every((m) => !/approve\?|execute/i.test(m.html.match(/href="([^"]+)"/)?.[1] || '')));
  });

  test('unapproved recipient requires owner approval', async () => {
    const o = await setupOwner();
    mock.registered.add('newvendor.testnet');
    const r = await propose(o, { recipientAccountId: 'newvendor.testnet', amount: '1000000', purpose: 'New vendor' });
    assert.equal(r.body.proposal.decision, 'needs_approval');
    assert.ok(r.body.proposal.decisionReasons.some((x) => /approved-recipient/.test(x)));
  });

  test('revoked agent cannot execute payments', async () => {
    const o = await setupOwner();
    mock.businesses.get(o.business.onchainId).agent = null;
    const r = await propose(o, { recipientId: o.recipientId, amount: '1000000', purpose: 'After revoke' });
    assert.equal(r.body.proposal.decision, 'needs_approval');
    assert.equal(await models.Transaction.countDocuments({ type: 'agent_payment' }), 0);
  });

  test('payment above available balance fails safely', async () => {
    const o = await setupOwner();
    const r = await propose(o, { recipientId: o.recipientId, amount: '500000000', purpose: 'Too much' });
    assert.equal(r.body.proposal.decision, 'rejected');
    assert.equal(r.body.proposal.status, 'rejected');
    assert.equal(mock.businesses.get(o.business.onchainId).balance, '100000000');
  });

  test('repeated requests with the same idempotency key do not pay twice', async () => {
    const o = await setupOwner();
    const body = { recipientId: o.recipientId, amount: '1000000', purpose: 'Once only' };
    const [a, b] = await Promise.all([propose(o, body, 'same-key-123'), propose(o, body, 'same-key-123')]);
    assert.equal(String(a.body.proposal._id), String(b.body.proposal._id));
    assert.equal(await models.Transaction.countDocuments({ type: 'agent_payment' }), 1);
    assert.equal(mock.businesses.get(o.business.onchainId).balance, '99000000');
    const again = await o.agent.post(`${o.base}/payments/proposals/${a.body.proposal._id}/execute`).set(H);
    assert.equal(again.status, 409);
  });

  test('failed token transfer is reported as failed, never as success', async () => {
    const o = await setupOwner();
    mock.failTransfers = true;
    const r = await propose(o, { recipientId: o.recipientId, amount: '1000000', purpose: 'Will fail' });
    assert.equal(r.body.proposal.status, 'failed');
    const tx = await models.Transaction.findById(r.body.proposal.transactionId);
    assert.equal(tx.status, 'failed');
    assert.equal(mock.businesses.get(o.business.onchainId).balance, '100000000');
  });

  test('RPC failure: treasury returns an error, never a zero balance', async () => {
    const o = await setupOwner();
    mock.down = true;
    const r = await o.agent.get(`${o.base}/treasury`);
    assert.equal(r.status, 503);
    assert.equal(r.body.balance, undefined);
  });
});

describe('owner approvals', () => {
  async function pendingApproval(o, amount = '30000000') {
    mock.registered.add('bigvendor.testnet');
    const r = await propose(o, { recipientAccountId: 'bigvendor.testnet', amount, purpose: 'Large invoice' });
    assert.equal(r.body.proposal.decision, 'needs_approval');
    return (await models.Approval.findOne({ proposalId: r.body.proposal._id })).toObject();
  }

  test('owner signs exact owner_pay; backend verifies on-chain before marking executed', async () => {
    const o = await setupOwner();
    const ap = await pendingApproval(o);
    const prep = await o.agent.post(`${o.base}/approvals/${ap._id}/prepare`).set(H).expect(200);
    const t = prep.body.transaction;
    assert.equal(t.receiverId, VAULT);
    assert.equal(t.methodName, 'owner_pay');
    assert.equal(t.deposit, '1');
    assert.deepEqual([t.args.recipient, t.args.amount, t.args.payment_id], ['bigvendor.testnet', '30000000', ap.paymentId]);
    const txHash = mock.ownerSigns(o.wallet, 'owner_pay', t.args);
    const sub = await o.agent.post(`${o.base}/approvals/${ap._id}/submit`).set(H).send({ txHash }).expect(200);
    assert.equal(sub.body.transaction.status, 'confirmed');
    assert.equal((await models.Approval.findById(ap._id)).status, 'executed');
  });

  test('a signed transaction with different details is a mismatch, not a success', async () => {
    const o = await setupOwner();
    const ap = await pendingApproval(o);
    const prep = await o.agent.post(`${o.base}/approvals/${ap._id}/prepare`).set(H).expect(200);
    const txHash = mock.ownerSigns(o.wallet, 'owner_pay', { ...prep.body.transaction.args, amount: '31000000', payment_id: 'bzother000001' });
    const sub = await o.agent.post(`${o.base}/approvals/${ap._id}/submit`).set(H).send({ txHash }).expect(200);
    assert.equal(sub.body.transaction.status, 'mismatch');
    assert.notEqual((await models.Approval.findById(ap._id)).status, 'executed');
  });

  test('expired approval cannot be prepared', async () => {
    const o = await setupOwner();
    const ap = await pendingApproval(o);
    await models.Approval.updateOne({ _id: ap._id }, { expiresAt: new Date(Date.now() - 1000) });
    const r = await o.agent.post(`${o.base}/approvals/${ap._id}/prepare`).set(H);
    assert.equal(r.status, 409);
    assert.equal((await models.Approval.findById(ap._id)).status, 'expired');
  });

  test('changing the amount after approval request invalidates the approval', async () => {
    const o = await setupOwner();
    mock.registered.add('bigvendor.testnet');
    const rec = await o.agent.post(`${o.base}/recipients`).set(H).send({ name: 'Big Vendor', nearAccountId: 'bigvendor.testnet' }).expect(201);
    const e = await o.agent.post(`${o.base}/expenses`).set(H).send({ title: 'Invoice 42', amount: '30000000', category: 'suppliers', recipientId: rec.body.recipient._id }).expect(201);
    const p = await propose(o, { recipientId: rec.body.recipient._id, amount: '30000000', purpose: 'Invoice 42', expenseId: e.body.expense._id });
    const ap = await models.Approval.findOne({ proposalId: p.body.proposal._id });
    const upd = await o.agent.patch(`${o.base}/expenses/${e.body.expense._id}`).set(H).send({ amount: '35000000' }).expect(200);
    assert.equal(upd.body.invalidatedApprovals, 1);
    assert.equal((await models.Approval.findById(ap._id)).status, 'invalidated');
    const r = await o.agent.post(`${o.base}/approvals/${ap._id}/prepare`).set(H);
    assert.equal(r.status, 409);
  });

  test('tampering with stored proposal details invalidates the approval', async () => {
    const o = await setupOwner();
    const ap = await pendingApproval(o);
    await models.PaymentProposal.updateOne({ _id: ap.proposalId }, { recipientAccountId: 'attacker.testnet' });
    const r = await o.agent.post(`${o.base}/approvals/${ap._id}/prepare`).set(H);
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'APPROVAL_INVALIDATED');
  });
});

describe('treasury deposits', () => {
  test('deposit is confirmed only when the vault credits this business', async () => {
    const o = await setupOwner();
    const prep = await o.agent.post(`${o.base}/treasury/deposit/prepare`).set(H).send({ amount: '5000000' }).expect(200);
    assert.equal(prep.body.transaction.receiverId, USDC);
    assert.equal(prep.body.transaction.methodName, 'ft_transfer_call');
    assert.equal(JSON.parse(prep.body.transaction.args.msg).business_id, o.business.onchainId);
    const good = mock.ownerDeposits(o.wallet, o.business.onchainId, '5000000');
    const r1 = await o.agent.post(`${o.base}/treasury/submit`).set(H).send({ type: 'deposit', txHash: good }).expect(200);
    assert.equal(r1.body.transaction.status, 'confirmed');
    assert.equal(r1.body.transaction.amount, '5000000');
    const wrong = mock.ownerDeposits(o.wallet, o.business.onchainId, '5000000', { target: 'other.testnet', credit: false });
    const r2 = await o.agent.post(`${o.base}/treasury/submit`).set(H).send({ type: 'deposit', txHash: wrong }).expect(200);
    assert.equal(r2.body.transaction.status, 'mismatch');
  });
});

describe('AI assistant', () => {
  test('AI proposals go through policy; only one proposal per turn; marked source=ai', async () => {
    const o = await setupOwner();
    let round = 0;
    setAiProvider({
      async chat() {
        round += 1;
        if (round === 1) {
          return {
            model: 'mock', usage: { promptTokens: 10, completionTokens: 5 },
            message: {
              role: 'assistant', content: '', tool_calls: [
                { id: 't1', type: 'function', function: { name: 'createPaymentProposal', arguments: JSON.stringify({ recipient: 'CloudSoft', amount: '2', purpose: 'Subscription' }) } },
                { id: 't2', type: 'function', function: { name: 'createPaymentProposal', arguments: JSON.stringify({ recipient: 'CloudSoft', amount: '3', purpose: 'Again' }) } },
              ],
            },
          };
        }
        return { model: 'mock', usage: { promptTokens: 10, completionTokens: 5 }, message: { role: 'assistant', content: 'Paid 2.00 USDC to CloudSoft.' } };
      },
    });
    const r = await o.agent.post(`${o.base}/agent/chat`).set(H).send({ message: 'Pay CloudSoft 2 USDC for the subscription' }).expect(200);
    assert.equal(r.body.proposals.length, 1);
    assert.equal(r.body.proposals[0].source, 'ai');
    assert.equal(r.body.proposals[0].amount, '2000000');
    assert.deepEqual(r.body.toolTrace.map((t) => t.ok), [true, false]);
    assert.equal(await models.Transaction.countDocuments(), 1);
  });

  test('AI unavailable returns a clear error so the user can pay manually', async () => {
    const o = await setupOwner();
    const r = await o.agent.post(`${o.base}/agent/chat`).set(H).send({ message: 'hello' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'AI_UNAVAILABLE');
  });
});

describe('configuration', () => {
  test('public config exposes network and contracts, never secrets', async () => {
    const r = await request(app).get('/api/v1/config/public').expect(200);
    assert.equal(r.body.network, 'testnet');
    assert.equal(r.body.usdcContractId, USDC);
    assert.equal(r.body.usdcIsOfficial, true);
    const text = JSON.stringify(r.body);
    for (const secret of ['JWT', 'test-secret', 'ed25519:test', 'BREVO_API_KEY']) assert.ok(!text.includes(secret));
  });
});
