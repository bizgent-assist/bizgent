// Lightweight in-process jobs. Correctness never depends on them: approval expiry is also
// checked on read, and transactions are verified on submit and on demand.
import { env } from './config/env.js';
import { Approval, PaymentProposal } from './models/index.js';
import { reverifyPending } from './services/payments/treasury.service.js';

export function startJobs() {
  if (env.isTest) return;
  setInterval(async () => {
    try {
      if (env.chainConfigured) await reverifyPending();
      const expired = await Approval.find({ status: 'pending', expiresAt: { $lte: new Date() } }).select('_id proposalId');
      if (expired.length) {
        await Approval.updateMany({ _id: { $in: expired.map((a) => a._id) } }, { status: 'expired' });
        await PaymentProposal.updateMany({ _id: { $in: expired.map((a) => a.proposalId) }, status: 'awaiting_approval' }, { status: 'expired' });
      }
    } catch (err) {
      console.error('[jobs]', err.message);
    }
  }, 30_000).unref();
}
