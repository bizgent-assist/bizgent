import { env } from '../../../config/env.js';
import { Agent, AgentPolicy, Recipient } from '../../../models/index.js';
import { chain } from '../../near/chain.js';
import { fmt } from '../../payments/payments.service.js';

export const policiesTools = [
  {
    name: 'getAgentPolicy',
    description: "The agent's spending policy (contract-enforced limits), agent status and approved recipients.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run({ business }) {
      const [policy, agent, recipients] = await Promise.all([
        AgentPolicy.findOne({ businessId: business._id }).lean(),
        Agent.findOne({ businessId: business._id }).lean(),
        Recipient.find({ businessId: business._id }).lean(),
      ]);
      let onchain = null;
      let chainNote = null;
      try { onchain = env.chainConfigured ? await chain().getBusiness(business.onchainId) : null; } catch (e) { chainNote = 'on-chain policy unavailable'; }
      return {
        source: onchain ? 'vault contract (authoritative)' : chainNote || 'not registered on-chain',
        agentStatus: agent?.status || 'not_configured',
        onchainAgent: onchain?.agent ?? null,
        agentPaused: onchain?.agent_paused ?? null,
        maxPerTransaction: onchain ? fmt(onchain.max_per_tx) : null,
        dailyLimit: onchain ? fmt(onchain.daily_limit) : null,
        remainingToday: onchain ? fmt(onchain.remaining_today) : null,
        everyPaymentNeedsApproval: Boolean(policy?.requireApprovalForAll),
        autoPaymentThreshold: policy?.autoApproveBelow && policy.autoApproveBelow !== '0' ? fmt(policy.autoApproveBelow) : 'contract limit',
        recipients: recipients.map((r) => ({ name: r.name, account: r.nearAccountId, approvedForAgent: r.approvedOnChain })),
      };
    },
  },
  {
    name: 'getBusinessBalance',
    description: 'Current vault USDC balance for the business, read live from the NEAR vault contract.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run({ business }) {
      if (!env.chainConfigured) return { error: 'Vault contract not configured; balance unavailable' };
      try {
        const b = await chain().getBusiness(business.onchainId);
        if (!b) return { error: 'Business is not registered on-chain yet' };
        return { balance: fmt(b.balance), spentToday: fmt(b.spent_today), agentRemainingToday: fmt(b.remaining_today), source: 'on-chain' };
      } catch {
        return { error: 'Balance unavailable (NEAR RPC error). Do not assume zero.' };
      }
    },
  },
];
