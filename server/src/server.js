import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './config/env.js';

// Optional: some Windows resolvers refuse SRV lookups from Node (mongodb+srv). Set
// DNS_SERVERS=8.8.8.8,1.1.1.1 locally to use explicit resolvers. Not needed on Render.
if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));
import { createApp } from './app.js';
import { startJobs } from './jobs.js';
import { chain } from './services/near/chain.js';

async function checkChain() {
  try {
    const meta = await chain().ftMetadata();
    if (meta?.decimals !== env.USDC_DECIMALS) {
      throw new Error(`USDC_DECIMALS=${env.USDC_DECIMALS} but token reports ${meta?.decimals}`);
    }
    console.log(`[near] ${env.NEAR_NETWORK} USDC ${env.USDC_CONTRACT_ID} (${meta.symbol}, ${meta.decimals} decimals)${env.usdcIsOfficial ? '' : ' — WARNING: not the official native USDC'}`);
    if (env.chainConfigured) {
      const cfg = await chain().getConfig();
      if (cfg.usdc_contract_id !== env.USDC_CONTRACT_ID) throw new Error(`Vault is configured for ${cfg.usdc_contract_id}, not ${env.USDC_CONTRACT_ID}`);
      console.log(`[near] vault ${env.BIZGENT_CONTRACT_ID} reachable (paused=${cfg.paused})`);
    }
  } catch (err) {
    if (/USDC_DECIMALS|Vault is configured/.test(err.message)) throw err;
    console.warn(`[near] chain check skipped: ${err.message}`);
  }
}

export async function start() {
  await mongoose.connect(env.MONGODB_URI);
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
  console.log('[db] connected, indexes ready');
  await checkChain();
  const app = createApp();
  app.listen(env.PORT, () => console.log(`[api] ${env.APP_NAME} API on :${env.PORT} (${env.NODE_ENV}, ${env.networkLabel})`));
  startJobs();
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.js')) {
  start().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
