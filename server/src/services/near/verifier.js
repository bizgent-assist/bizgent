// On-chain verification. Pure parsing functions + verification against the vault state.
// A transaction is reported `confirmed` ONLY when the actual execution outcome and the
// vault's recorded payment status agree with the exact expected details.

const EVENT_PREFIX = 'EVENT_JSON:';

function decodeArgs(b64) {
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Normalises an RPC tx response into { signerId, receiverId, calls[], events[], failed } */
export function parseTx(rpc, vaultId) {
  const tx = rpc?.transaction || {};
  const calls = (tx.actions || [])
    .map((a) => a?.FunctionCall)
    .filter(Boolean)
    .map((fc) => ({ method: fc.method_name, args: decodeArgs(fc.args), deposit: String(fc.deposit ?? '0') }));
  const events = [];
  for (const r of rpc?.receipts_outcome || []) {
    if (r?.outcome?.executor_id !== vaultId) continue;
    for (const log of r.outcome.logs || []) {
      if (!log.startsWith(EVENT_PREFIX)) continue;
      try {
        const ev = JSON.parse(log.slice(EVENT_PREFIX.length));
        if (ev.standard === 'bizgent') for (const d of ev.data || []) events.push({ event: ev.event, ...d });
      } catch { /* ignore malformed logs */ }
    }
  }
  const failed = Boolean(rpc?.status && Object.prototype.hasOwnProperty.call(rpc.status, 'Failure'));
  const failureMessage = failed ? JSON.stringify(rpc.status.Failure).slice(0, 300) : null;
  return { hash: tx.hash, signerId: tx.signer_id, receiverId: tx.receiver_id, calls, events, failed, failureMessage };
}

const METHOD_BY_KIND = { agent_payment: 'agent_pay', owner_payment: 'owner_pay', withdrawal: 'withdraw' };

/**
 * Verifies an outgoing vault transfer (agent payment, owner payment or withdrawal).
 * expected: { kind, businessId, paymentId, recipient, amount, signerId }
 * Returns { status: 'confirmed'|'failed'|'pending'|'mismatch', reason }
 */
export async function verifyOutgoing(chainClient, txHash, expected) {
  const rpc = await chainClient.getTx(txHash, expected.signerId);
  if (!rpc) return { status: 'pending', reason: 'Transaction not yet available on RPC' };
  const p = parseTx(rpc, chainClient.vaultId);

  if (p.receiverId !== chainClient.vaultId) return { status: 'mismatch', reason: 'Transaction was not sent to the Bizgent vault' };
  if (p.signerId !== expected.signerId) return { status: 'mismatch', reason: `Signed by ${p.signerId}, expected ${expected.signerId}` };
  const method = METHOD_BY_KIND[expected.kind];
  const call = p.calls.find((c) => c.method === method);
  if (!call || !call.args) return { status: 'mismatch', reason: `No ${method} call found in transaction` };
  const a = call.args;
  const idField = expected.kind === 'withdrawal' ? 'request_id' : 'payment_id';
  const recipientArg = expected.kind === 'withdrawal' ? (a.receiver_id ?? expected.signerId) : a.recipient;
  if (a.business_id !== expected.businessId || a[idField] !== expected.paymentId
    || String(a.amount) !== String(expected.amount) || recipientArg !== expected.recipient) {
    return { status: 'mismatch', reason: 'Signed transaction details differ from the approved payment' };
  }

  const done = p.events.find((e) => e.payment_id === expected.paymentId && (e.event === 'payment_completed' || e.event === 'payment_failed'));
  if (p.failed && !done) {
    return { status: 'failed', reason: `Transaction failed: ${p.failureMessage}` };
  }

  // Cross-check the vault's recorded state (authoritative).
  const onchain = await chainClient.getPayment(expected.businessId, expected.paymentId);
  if (!onchain) return p.failed ? { status: 'failed', reason: 'Rejected by contract' } : { status: 'pending', reason: 'Payment not yet recorded' };
  if (onchain.recipient !== expected.recipient || String(onchain.amount) !== String(expected.amount)) {
    return { status: 'mismatch', reason: 'Vault payment record differs from expected details' };
  }
  if (onchain.status === 'Completed') return { status: 'confirmed', reason: 'Vault recorded payment as Completed' };
  if (onchain.status === 'Failed') return { status: 'failed', reason: 'Token transfer failed; vault restored the balance' };
  return { status: 'pending', reason: 'Vault payment still pending' };
}

/** Verifies a deposit made with ft_transfer_call on the USDC contract. */
export async function verifyDeposit(chainClient, txHash, { businessId, signerId }) {
  const rpc = await chainClient.getTx(txHash, signerId);
  if (!rpc) return { status: 'pending', reason: 'Transaction not yet available on RPC' };
  const p = parseTx(rpc, chainClient.vaultId);
  if (p.receiverId !== chainClient.usdcId) return { status: 'mismatch', reason: 'Deposit was not sent through the configured USDC contract' };
  if (p.signerId !== signerId) return { status: 'mismatch', reason: 'Unexpected signer' };
  const call = p.calls.find((c) => c.method === 'ft_transfer_call');
  if (!call?.args || call.args.receiver_id !== chainClient.vaultId) return { status: 'mismatch', reason: 'Not an ft_transfer_call to the vault' };
  let msg = null;
  try { msg = JSON.parse(call.args.msg); } catch { /* invalid */ }
  if (msg?.business_id !== businessId) return { status: 'mismatch', reason: 'Deposit message does not target this business' };

  const credited = p.events.find((e) => e.event === 'deposit' && e.business_id === businessId);
  if (credited) return { status: 'confirmed', reason: 'Vault credited the deposit', amount: String(credited.amount), sender: credited.sender_id };
  const refunded = p.events.find((e) => e.event === 'deposit_refunded');
  if (refunded) return { status: 'failed', reason: `Deposit refunded (${refunded.reason})`, amount: String(call.args.amount) };
  if (p.failed) return { status: 'failed', reason: `Transaction failed: ${p.failureMessage}`, amount: String(call.args.amount) };
  return { status: 'pending', reason: 'Deposit not yet credited', amount: String(call.args.amount) };
}
