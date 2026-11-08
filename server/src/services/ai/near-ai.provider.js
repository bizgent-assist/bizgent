// NEAR AI Cloud via its OpenAI-compatible Chat Completions API (base URL + bearer key).
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';

export function createOpenAiCompatibleProvider({ baseUrl, apiKey, model, name }) {
  return {
    name,
    model,
    async chat({ messages, tools, maxTokens }) {
      let res;
      try {
        res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            tools: tools?.length ? tools : undefined,
            tool_choice: tools?.length ? 'auto' : undefined,
            max_tokens: maxTokens,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
        });
      } catch (err) {
        throw ApiError.unavailable(`AI provider unreachable: ${err.message}`, 'AI_UNAVAILABLE');
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.error?.message || body?.message || res.statusText;
        const code = res.status === 402 || /credit|balance|quota/i.test(detail) ? 'AI_CREDITS_EXHAUSTED' : 'AI_UNAVAILABLE';
        throw ApiError.unavailable(`AI provider error (${res.status}): ${String(detail).slice(0, 200)}`, code);
      }
      const message = body?.choices?.[0]?.message;
      if (!message) throw ApiError.unavailable('AI provider returned no message', 'AI_UNAVAILABLE');
      return {
        message,
        model: body.model || model,
        usage: { promptTokens: body.usage?.prompt_tokens ?? 0, completionTokens: body.usage?.completion_tokens ?? 0 },
      };
    },
  };
}

export function createNearAiProvider() {
  return createOpenAiCompatibleProvider({
    baseUrl: env.AI_BASE_URL, apiKey: env.AI_API_KEY, model: env.AI_MODEL, name: 'near-ai',
  });
}
