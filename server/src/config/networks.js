// Official, network-specific constants used to CROSS-CHECK configuration.
// The app reads its actual contract IDs from environment variables; these values exist so
// that startup fails if the configured USDC contract does not match the official one for
// the selected network (prevents testnet/mainnet confusion and USDC.e mix-ups).
//
// Source: Circle — USDC contract addresses (developers.circle.com/stablecoins/usdc-contract-addresses),
// verified 2026-11-08. Re-verify before any deployment.
export const NETWORKS = {
  testnet: {
    accountSuffix: '.testnet',
    officialUsdc: '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af',
    explorerUrl: 'https://testnet.nearblocks.io',
    label: 'TESTNET',
  },
  mainnet: {
    accountSuffix: '.near',
    officialUsdc: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    explorerUrl: 'https://nearblocks.io',
    label: 'MAINNET',
  },
};

// Bridged USDC.e — must never be configured as the treasury asset.
export const KNOWN_BRIDGED_USDC = ['a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.factory.bridge.near'];
