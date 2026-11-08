// Deterministic payment policy. The AI never decides; this function does.
// The vault contract remains authoritative: anything decided `auto` here is re-checked
// on-chain by `agent_pay`, and this function can only be STRICTER than the contract.
import { cmpUnits } from '../../utils/money.js';

/**
 * @param {object} p
 * @param {string} p.amount base units
 * @param {object} p.policy AgentPolicy doc (backend tightening rules)
 * @param {object} p.agent Agent doc
 * @param {string} p.agentSignerId configured agent account (env) or ''
 * @param {object|null} p.onchain vault BusinessView, or null when unavailable
 * @param {boolean|null} p.recipientApproved on-chain approved-recipient flag
 * @param {boolean|null} p.recipientRegistered USDC storage registration
 * @param {string|null} p.chainError
 * @returns {{decision:'auto'|'needs_approval'|'rejected', reasons:string[]}}
 */
export function evaluatePayment(p) {
  const reasons = [];
  if (!/^\d+$/.test(p.amount) || cmpUnits(p.amount, '0') <= 0) {
    return { decision: 'rejected', reasons: ['Amount must be greater than zero'] };
  }
  if (p.chainError || !p.onchain) {
    return {
      decision: 'needs_approval',
      reasons: [`On-chain state unavailable (${p.chainError || 'business not registered on-chain'}); owner signature required`],
    };
  }
  const oc = p.onchain;
  if (cmpUnits(oc.balance, p.amount) < 0) {
    return { decision: 'rejected', reasons: ['Insufficient vault balance for this payment'] };
  }
  if (p.recipientRegistered === false) {
    return {
      decision: 'rejected',
      reasons: ['Recipient account is not registered with the USDC contract (storage_deposit required) — the transfer would fail'],
    };
  }

  if (p.agent?.status !== 'active') reasons.push('Agent is not active');
  if (!p.agentSignerId) reasons.push('Agent signer is not configured on the server');
  if (!oc.agent) reasons.push('No agent is authorised on-chain for this business');
  else if (oc.agent !== p.agentSignerId || (p.agent?.agentAccountId && oc.agent !== p.agent.agentAccountId)) {
    reasons.push('On-chain agent does not match the configured agent account');
  }
  if (oc.agent_paused) reasons.push('Agent is paused on-chain');
  if (!p.recipientApproved) reasons.push('Recipient is not on the approved-recipient list');
  if (p.recipientRegistered == null) reasons.push('Recipient USDC registration could not be confirmed');
  if (cmpUnits(p.amount, oc.max_per_tx) > 0) reasons.push('Amount exceeds the per-transaction agent limit');
  if (cmpUnits(p.amount, oc.remaining_today) > 0) reasons.push("Amount exceeds the agent's remaining daily limit");
  if (p.policy?.requireApprovalForAll) reasons.push('Business policy requires owner approval for every payment');
  if (p.policy?.autoApproveBelow && p.policy.autoApproveBelow !== '0' && cmpUnits(p.amount, p.policy.autoApproveBelow) > 0) {
    reasons.push('Amount is above the automatic-payment threshold');
  }

  if (reasons.length) return { decision: 'needs_approval', reasons };
  return { decision: 'auto', reasons: ['Within contract-enforced agent policy and approved recipient'] };
}
