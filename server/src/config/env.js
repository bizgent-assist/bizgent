import 'dotenv/config';
import Joi from 'joi';
import { NETWORKS, KNOWN_BRIDGED_USDC } from './networks.js';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),

  APP_NAME: Joi.string().default('Bizgent'),
  APP_BASE_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  ALLOWED_ORIGINS: Joi.string().required(), // comma-separated
  TRUST_PROXY: Joi.number().integer().min(0).default(1),

  MONGODB_URI: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  COOKIE_NAME: Joi.string().default('bz_session'),

  BREVO_API_KEY: Joi.string().allow('').default(''),
  BREVO_SENDER_EMAIL: Joi.string().email().allow('').default(''),
  BREVO_SENDER_NAME: Joi.string().default('Bizgent'),
  BREVO_WEBHOOK_TOKEN: Joi.string().allow('').default(''),
  SUPPORT_EMAIL: Joi.string().email().allow('').default(''),

  AI_PROVIDER: Joi.string().valid('near-ai', 'claude', 'none').default('near-ai'),
  AI_BASE_URL: Joi.string().uri().default('https://cloud-api.near.ai/v1'),
  AI_API_KEY: Joi.string().allow('').default(''),
  AI_MODEL: Joi.string().default('anthropic/claude-haiku-5-5'),
  AI_MAX_OUTPUT_TOKENS: Joi.number().integer().min(64).max(4000).default(600),
  AI_MAX_TOOL_ROUNDS: Joi.number().integer().min(1).max(6).default(3),
  AI_HISTORY_MESSAGES: Joi.number().integer().min(0).max(20).default(6),
  AI_DAILY_REQUEST_LIMIT: Joi.number().integer().min(0).default(100),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),

  NEAR_NETWORK: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  MAINNET_ENABLED: Joi.boolean().default(false),
  NEAR_RPC_URL: Joi.string().uri().required(),
  NEAR_EXPLORER_URL: Joi.string().uri().allow('').default(''),
  BIZGENT_CONTRACT_ID: Joi.string().allow('').default(''),
  USDC_CONTRACT_ID: Joi.string().required(),
  USDC_DECIMALS: Joi.number().integer().min(0).max(24).default(6),
  AGENT_ACCOUNT_ID: Joi.string().allow('').default(''),
  AGENT_PRIVATE_KEY: Joi.string().allow('').default(''), // function-call access key ONLY

  APPROVAL_TTL_MINUTES: Joi.number().integer().min(5).max(10080).default(1440),
  OWNER_PAY_GAS_TGAS: Joi.number().integer().min(30).max(300).default(100),
}).unknown(true);

function load() {
  const { value, error } = schema.validate(process.env, { abortEarly: false });
  if (error) {
    const missing = error.details.map((d) => `  - ${d.message}`).join('\n');
    throw new Error(`Invalid server configuration:\n${missing}\nSee server/.env.example`);
  }
  const net = NETWORKS[value.NEAR_NETWORK];

  // Network safety: never silently run on mainnet, never mix contracts across networks.
  if (value.NEAR_NETWORK === 'mainnet' && !value.MAINNET_ENABLED) {
    throw new Error('NEAR_NETWORK=mainnet requires MAINNET_ENABLED=true (deliberate opt-in).');
  }
  if (KNOWN_BRIDGED_USDC.includes(value.USDC_CONTRACT_ID)) {
    throw new Error('USDC_CONTRACT_ID points to bridged USDC.e. Use native USDC.');
  }
  if (value.USDC_CONTRACT_ID !== net.officialUsdc && value.NODE_ENV === 'production') {
    throw new Error(`USDC_CONTRACT_ID does not match the official ${value.NEAR_NETWORK} native USDC contract.`);
  }
  for (const key of ['BIZGENT_CONTRACT_ID', 'AGENT_ACCOUNT_ID']) {
    if (value[key] && !value[key].endsWith(net.accountSuffix)) {
      throw new Error(`${key} (${value[key]}) is not a ${value.NEAR_NETWORK} account (expected *${net.accountSuffix}).`);
    }
  }
  if (value.AGENT_PRIVATE_KEY && !value.AGENT_ACCOUNT_ID) {
    throw new Error('AGENT_PRIVATE_KEY is set but AGENT_ACCOUNT_ID is empty.');
  }

  return Object.freeze({
    ...value,
    isProd: value.NODE_ENV === 'production',
    isTest: value.NODE_ENV === 'test',
    allowedOrigins: value.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    explorerUrl: value.NEAR_EXPLORER_URL || net.explorerUrl,
    networkLabel: net.label,
    usdcIsOfficial: value.USDC_CONTRACT_ID === net.officialUsdc,
    chainConfigured: Boolean(value.BIZGENT_CONTRACT_ID),
    agentConfigured: Boolean(value.AGENT_ACCOUNT_ID && value.AGENT_PRIVATE_KEY),
    emailConfigured: Boolean(value.BREVO_API_KEY && value.BREVO_SENDER_EMAIL),
    aiConfigured: value.AI_PROVIDER !== 'none' && Boolean(value.AI_API_KEY),
  });
}

export const env = load();
