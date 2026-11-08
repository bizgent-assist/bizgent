import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { csrfGuard, errorHandler, notFound, requireAuth } from './middleware/index.js';
import authRoutes from './routes/auth.routes.js';
import businessRoutes from './routes/business.routes.js';
import { applyBrevoEvent } from './services/notifications/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.allowedOrigins.includes(origin)),
    credentials: true,
    allowedHeaders: ['content-type', 'x-requested-with', 'idempotency-key'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(rateLimit({ windowMs: 15 * 60_000, limit: env.isTest ? 10_000 : 600, standardHeaders: 'draft-8', legacyHeaders: false }));
  api.use(csrfGuard);

  api.get('/health', (_req, res) => res.json({ ok: true, network: env.NEAR_NETWORK }));
  api.get('/config/public', (_req, res) => res.json({
    appName: env.APP_NAME,
    network: env.NEAR_NETWORK,
    networkLabel: env.networkLabel,
    vaultContractId: env.BIZGENT_CONTRACT_ID || null,
    usdcContractId: env.USDC_CONTRACT_ID,
    usdcDecimals: env.USDC_DECIMALS,
    usdcIsOfficial: env.usdcIsOfficial,
    explorerUrl: env.explorerUrl,
    agentAccountId: env.AGENT_ACCOUNT_ID || null,
    features: { ai: env.aiConfigured, email: env.emailConfigured, chain: env.chainConfigured, agentSigner: env.agentConfigured },
  }));

  const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: env.isTest ? 10_000 : 30, standardHeaders: 'draft-8', legacyHeaders: false });
  api.use('/auth', authLimiter, authRoutes);
  api.use('/businesses', requireAuth, businessRoutes);

  api.post('/webhooks/brevo', async (req, res) => {
    if (!env.BREVO_WEBHOOK_TOKEN || req.query.token !== env.BREVO_WEBHOOK_TOKEN) return res.status(401).json({ ok: false });
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const e of events) await applyBrevoEvent(e);
    res.json({ ok: true });
  });

  app.use('/api/v1', api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
