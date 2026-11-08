import { createContext, useContext, useEffect, useState } from 'react';
import { config } from '../config/env.js';
import { api } from '../services/api/index.js';

const ConfigContext = createContext(null);

/**
 * Loads the backend's public network configuration and compares it with this build's.
 * Any mismatch (e.g. frontend on testnet, backend on mainnet) blocks financial actions.
 */
export function ConfigProvider({ children }) {
  const [state, setState] = useState({ loading: true, server: null, error: null, mismatches: [] });

  useEffect(() => {
    let alive = true;
    api.config.public()
      .then((server) => {
        const mismatches = [];
        if (server.network !== config.network) mismatches.push(`network (frontend ${config.network}, backend ${server.network})`);
        if (config.vaultContractId && server.vaultContractId && config.vaultContractId !== server.vaultContractId) mismatches.push('vault contract');
        if (config.usdcContractId && config.usdcContractId !== server.usdcContractId) mismatches.push('USDC contract');
        if (alive) setState({ loading: false, server, error: null, mismatches });
      })
      .catch((error) => alive && setState({ loading: false, server: null, error, mismatches: [] }));
    return () => { alive = false; };
  }, []);

  const value = {
    ...state,
    network: state.server?.network || config.network,
    vaultContractId: state.server?.vaultContractId || config.vaultContractId,
    usdcContractId: state.server?.usdcContractId || config.usdcContractId,
    explorerUrl: state.server?.explorerUrl || config.explorerUrl,
    features: state.server?.features || {},
    demo: config.mocksEnabled,
    chainSafe: !state.loading && !state.error && state.mismatches.length === 0 && Boolean(state.server?.vaultContractId),
  };
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
