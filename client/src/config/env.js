// Single source of PUBLIC frontend configuration. Never put secrets in VITE_ variables.
const e = import.meta.env;

export const config = Object.freeze({
  appName: e.VITE_APP_NAME || 'Bizgent',
  apiUrl: e.VITE_API_URL || '/api/v1',
  network: e.VITE_NEAR_NETWORK || 'testnet',
  rpcUrl: e.VITE_NEAR_RPC_URL || '',
  vaultContractId: e.VITE_BIZGENT_CONTRACT_ID || '',
  usdcContractId: e.VITE_USDC_CONTRACT_ID || '',
  explorerUrl: e.VITE_EXPLORER_URL || (e.VITE_NEAR_NETWORK === 'mainnet' ? 'https://nearblocks.io' : 'https://testnet.nearblocks.io'),
  supportEmail: e.VITE_SUPPORT_EMAIL || '',
  // Mock adapter is only possible in the dev server; production builds refuse to enable it.
  mocksEnabled: e.DEV && e.VITE_ENABLE_MOCKS === 'true',
});

export const isTestnet = config.network !== 'mainnet';
