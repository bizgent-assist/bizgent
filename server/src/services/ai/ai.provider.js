// Provider abstraction. Business logic depends only on this interface:
//   chat({ messages, tools, maxTokens }) -> { message: {role, content, tool_calls?}, usage, model }
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';
import { createNearAiProvider } from './near-ai.provider.js';
import { createClaudeProvider } from './claude.provider.js';

let override = null;
export function setAiProvider(p) { override = p; }

export function getAiProvider() {
  if (override) return override;
  if (!env.aiConfigured) throw ApiError.unavailable('AI assistant is not configured (AI_PROVIDER / AI_API_KEY). Create proposals manually.', 'AI_UNAVAILABLE');
  if (env.AI_PROVIDER === 'near-ai') return createNearAiProvider();
  if (env.AI_PROVIDER === 'claude') return createClaudeProvider();
  throw ApiError.unavailable('AI provider disabled', 'AI_UNAVAILABLE');
}
