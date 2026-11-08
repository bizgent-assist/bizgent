// One cheap request to confirm the configured model supports tool calling via NEAR AI Cloud.
//   npm run ai:smoke            (uses AI_MODEL from .env)
//   npm run ai:smoke -- --model openai/gpt-5-nano
// Prints token usage and an estimated cost from the public NEAR AI model list.
import 'dotenv/config';

const i = process.argv.indexOf('--model');
const model = i > -1 ? process.argv[i + 1] : process.env.AI_MODEL || 'anthropic/claude-haiku-5-5';
const base = (process.env.AI_BASE_URL || 'https://cloud-api.near.ai/v1').replace(/\/$/, '');
if (!process.env.AI_API_KEY) {
  console.error('AI_API_KEY is not set in server/.env');
  process.exit(1);
}

const tools = [{
  type: 'function',
  function: {
    name: 'getBusinessBalance',
    description: 'Current vault USDC balance.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
}];

const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env.AI_API_KEY}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    max_tokens: 100,
    messages: [
      { role: 'system', content: 'You are a finance assistant. Use tools for balances.' },
      { role: 'user', content: 'What is our balance?' },
    ],
    tools,
    tool_choice: 'auto',
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, body?.error?.message || body);
  process.exit(1);
}
const msg = body.choices?.[0]?.message;
const called = msg?.tool_calls?.[0]?.function?.name;
console.log(`model: ${body.model || model}`);
console.log(`tool call: ${called || 'NONE'}${called === 'getBusinessBalance' ? '  ✓ tool calling works' : '  ✗ model did not call the tool'}`);
console.log(`usage: ${JSON.stringify(body.usage)}`);

try {
  const list = await (await fetch(`${base}/model/list`)).json();
  const entry = (list.models || list.data || list).find?.((m) => (m.modelId || m.id) === model);
  const inP = Number(entry?.inputCostPerToken?.amount ?? entry?.input_cost_per_token ?? NaN);
  const outP = Number(entry?.outputCostPerToken?.amount ?? entry?.output_cost_per_token ?? NaN);
  if (Number.isFinite(inP) && Number.isFinite(outP) && body.usage) {
    const scale = entry?.inputCostPerToken?.scale ? 10 ** -entry.inputCostPerToken.scale : 1;
    const cost = (body.usage.prompt_tokens * inP + body.usage.completion_tokens * outP) * scale;
    console.log(`estimated cost of this call: ~$${cost.toFixed(6)}`);
  }
} catch { /* pricing lookup is best-effort */ }
process.exit(called ? 0 : 2);
