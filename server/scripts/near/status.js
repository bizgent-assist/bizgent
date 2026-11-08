// Read-only checks: USDC metadata, vault config, a business and an agent's keys.
//   node scripts/near/status.js --vault vault.you.testnet [--business acme-1a2b3c] [--agent agent-...testnet]
import { USDC, arg, provider, view } from './common.js';

const vault = arg('vault', process.env.BIZGENT_CONTRACT_ID);
console.log('USDC', USDC, await view(USDC, 'ft_metadata').then((m) => ({ symbol: m.symbol, decimals: m.decimals })));
if (vault) {
  console.log('Vault config', await view(vault, 'get_config'));
  console.log('Vault USDC registration', await view(USDC, 'storage_balance_of', { account_id: vault }));
  console.log('Vault USDC balance (all businesses)', await view(USDC, 'ft_balance_of', { account_id: vault }));
}
const business = arg('business');
if (vault && business) console.log('Business', await view(vault, 'get_business', { business_id: business }));
const agent = arg('agent');
if (agent) {
  const keys = await provider.viewAccessKeyList({ accountId: agent, finality: 'final' });
  console.log('Agent keys', JSON.stringify(keys.keys.map((k) => ({ key: k.public_key, permission: k.access_key.permission })), null, 1));
}
