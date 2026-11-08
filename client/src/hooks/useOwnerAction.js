import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api/index.js';
import { useWalletFlow } from './useWalletFlow.js';

/** Owner-signed vault configuration (register, policy, agent, recipients), followed by a
 *  re-read of authoritative on-chain state. */
export function useOwnerAction() {
  const { business, refresh } = useAuth();
  const flow = useWalletFlow();
  const flowRun = flow.run;
  const run = useCallback(async (action, params) => {
    const out = await flowRun({
      prepare: () => api.business.prepareOnchain(business._id, action, params),
      submit: () => api.business.syncOnchain(business._id),
    });
    await refresh();
    return out;
  }, [flowRun, business._id, refresh]);
  return { ...flow, run };
}
