import { useCallback, useState } from 'react';
import { useConfig } from '../context/ConfigContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';

/**
 * Standard owner-signed flow:
 *   1. backend prepares the exact transaction  2. owner's wallet signs and sends it
 *   3. backend verifies the on-chain outcome   (success is shown only after step 3)
 */
export function useWalletFlow() {
  const wallet = useWallet();
  const cfg = useConfig();
  const [step, setStep] = useState('idle'); // idle | preparing | signing | verifying | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const run = useCallback(async ({ prepare, submit }) => {
    setError(null);
    setResult(null);
    try {
      if (cfg.mismatches?.length) throw new Error(`Network configuration mismatch: ${cfg.mismatches.join(', ')}. Financial actions are blocked.`);
      setStep('preparing');
      const prepared = await prepare();
      setStep('signing');
      const txHash = await wallet.signAndSend(prepared.transaction);
      setStep('verifying');
      const out = submit ? await submit(txHash, prepared) : { txHash };
      setResult(out);
      setStep('done');
      return out;
    } catch (e) {
      setError(e);
      setStep('error');
      throw e;
    }
  }, [wallet, cfg.mismatches]);

  const reset = () => { setStep('idle'); setError(null); setResult(null); };
  const busy = ['preparing', 'signing', 'verifying'].includes(step);
  const label = { preparing: 'Preparing…', signing: 'Confirm in your wallet…', verifying: 'Verifying on-chain…' }[step];
  return { run, step, busy, label, error, result, reset };
}
