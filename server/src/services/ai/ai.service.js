// Chat orchestration with strict cost controls: short prompt, bounded history, bounded
// tool rounds, bounded output tokens and a per-business daily request cap.
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { ChatMessage } from '../../models/index.js';
import { ApiError } from '../../utils/errors.js';
import { audit } from '../audit.js';
import { getAiProvider } from './ai.provider.js';
import { businessAgentPrompt } from './prompts/business-agent.prompt.js';
import { toolHandlers, toolSchemas } from './tools/index.js';

const MAX_TOOL_RESULT_CHARS = 4000;

async function enforceDailyCap(businessId) {
  if (!env.AI_DAILY_REQUEST_LIMIT) return;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const used = await ChatMessage.countDocuments({ businessId, role: 'user', createdAt: { $gte: since } });
  if (used >= env.AI_DAILY_REQUEST_LIMIT) {
    throw new ApiError(429, 'AI_DAILY_LIMIT', `Daily AI request limit (${env.AI_DAILY_REQUEST_LIMIT}) reached. You can still create payments manually.`);
  }
}

export async function chat({ business, user, message }) {
  await enforceDailyCap(business._id);
  const provider = getAiProvider(); // throws AI_UNAVAILABLE if not configured

  const history = env.AI_HISTORY_MESSAGES
    ? (await ChatMessage.find({ businessId: business._id, userId: user._id }).sort({ createdAt: -1 }).limit(env.AI_HISTORY_MESSAGES).lean()).reverse()
    : [];
  const messages = [
    { role: 'system', content: businessAgentPrompt({ businessName: business.name, today: new Date().toISOString().slice(0, 10), network: env.NEAR_NETWORK }) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];
  const userMsg = await ChatMessage.create({ businessId: business._id, userId: user._id, role: 'user', content: message });

  const ctx = { business, user, proposalsThisTurn: 0, proposalIds: [], turnId: String(userMsg._id) || crypto.randomUUID() };
  const toolTrace = [];
  const usage = { promptTokens: 0, completionTokens: 0 };
  let reply = null;
  let model = null;

  for (let round = 0; round <= env.AI_MAX_TOOL_ROUNDS; round++) {
    const allowTools = round < env.AI_MAX_TOOL_ROUNDS;
    const res = await provider.chat({ messages, tools: allowTools ? toolSchemas : undefined, maxTokens: env.AI_MAX_OUTPUT_TOKENS });
    model = res.model;
    usage.promptTokens += res.usage.promptTokens;
    usage.completionTokens += res.usage.completionTokens;
    const calls = res.message.tool_calls || [];
    if (!calls.length || !allowTools) {
      reply = (res.message.content || '').trim();
      break;
    }
    messages.push({ role: 'assistant', content: res.message.content || '', tool_calls: calls });
    for (const call of calls) {
      const handler = toolHandlers[call.function?.name];
      let result;
      let ok = true;
      if (!handler) {
        result = { error: `Unknown tool ${call.function?.name}` };
        ok = false;
      } else {
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await handler.run(ctx, args || {});
          if (result?.error) ok = false;
        } catch (err) {
          ok = false;
          result = { error: err.status ? err.message : 'Tool failed' };
          if (!err.status) console.error('[ai] tool error', call.function?.name, err);
        }
      }
      toolTrace.push({ name: call.function?.name || 'unknown', ok });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }
  if (!reply) reply = 'I could not complete that request. Please try rephrasing, or create the payment manually.';

  const assistantMsg = await ChatMessage.create({
    businessId: business._id, userId: user._id, role: 'assistant', content: reply.slice(0, 8000),
    proposalIds: ctx.proposalIds, toolTrace, model, usage,
  });
  if (ctx.proposalIds.length) {
    await audit({ businessId: business._id, actorType: 'ai', actorId: model, action: 'ai.proposal_created', details: { proposalIds: ctx.proposalIds.map(String) } });
  }
  return { message: assistantMsg, proposalIds: ctx.proposalIds, toolTrace, usage, model };
}
