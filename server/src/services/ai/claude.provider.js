// Placeholder for a direct Claude API provider (separate billing from Claude Code).
// Claude models are also reachable through NEAR AI Cloud's OpenAI-compatible gateway
// (e.g. AI_MODEL=anthropic/claude-haiku-5-5), which is the configuration used by the MVP.
import { ApiError } from '../../utils/errors.js';

export function createClaudeProvider() {
  return {
    name: 'claude',
    async chat() {
      throw ApiError.unavailable('Direct Claude API provider is not implemented in the MVP; use AI_PROVIDER=near-ai', 'AI_UNAVAILABLE');
    },
  };
}
