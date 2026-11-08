// NEAR wallet via @hot-labs/near-connect (recommended by NEAR docs for web login).
// The owner's wallet signs every owner action; Bizgent never holds the owner's keys.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '../config/env.js';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const connectorRef = useRef(null);
  const [state, setState] = useState({ ready: false, accountId: null, error: null });

  const getConnector = useCallback(async () => {
    if (connectorRef.current) return connectorRef.current;
    const { NearConnector } = await import('@hot-labs/near-connect');
    const connector = new NearConnector({ network: config.network, features: { signAndSendTransaction: true } });
    connector.on('wallet:signIn', (t) => setState((s) => ({ ...s, accountId: t.accounts?.[0]?.accountId || null })));
    connector.on('wallet:signOut', () => setState((s) => ({ ...s, accountId: null })));
    connectorRef.current = connector;
    return connector;
  }, []);

  // Restore an existing wallet session without prompting.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const connector = await getConnector();
        await connector.whenManifestLoaded;
        const wallet = await connector.wallet().catch(() => null);
        const accounts = wallet ? await wallet.getAccounts().catch(() => []) : [];
        if (alive) setState({ ready: true, accountId: accounts[0]?.accountId || null, error: null });
      } catch (error) {
        if (alive) setState({ ready: true, accountId: null, error });
      }
    })();
    return () => { alive = false; };
  }, [getConnector]);

  const connect = useCallback(async () => {
    const connector = await getConnector();
    await connector.connect();
    const wallet = await connector.wallet();
    const accounts = await wallet.getAccounts();
    const accountId = accounts[0]?.accountId || null;
    setState((s) => ({ ...s, accountId }));
    return accountId;
  }, [getConnector]);

  const disconnect = useCallback(async () => {
    const connector = await getConnector();
    await connector.disconnect().catch(() => {});
    setState((s) => ({ ...s, accountId: null }));
  }, [getConnector]);

  const ensureWallet = useCallback(async (expectedAccountId) => {
    const connector = await getConnector();
    let wallet = await connector.wallet().catch(() => null);
    if (!wallet) { await connect(); wallet = await connector.wallet(); }
    const accounts = await wallet.getAccounts();
    const current = accounts[0]?.accountId;
    if (expectedAccountId && current !== expectedAccountId) {
      throw new Error(`Connected wallet is ${current || 'none'}; switch to ${expectedAccountId} to sign.`);
    }
    return wallet;
  }, [getConnector, connect]);

  /** Signs and sends a backend-prepared transaction. Returns the tx hash. */
  const signAndSend = useCallback(async (tx) => {
    const wallet = await ensureWallet(tx.signerId);
    const result = await wallet.signAndSendTransaction({
      signerId: tx.signerId,
      receiverId: tx.receiverId,
      actions: [{ type: 'FunctionCall', params: { methodName: tx.methodName, args: tx.args, gas: tx.gas, deposit: tx.deposit } }],
    });
    const hash = result?.transaction?.hash || result?.transaction_outcome?.id;
    if (!hash) throw new Error('Wallet did not return a transaction hash');
    return hash;
  }, [ensureWallet]);

  /** NEP-413 message signing (wallet linking). */
  const signMessage = useCallback(async ({ message, recipient, nonceBase64 }) => {
    const wallet = await ensureWallet();
    const nonce = Uint8Array.from(atob(nonceBase64), (c) => c.charCodeAt(0));
    return wallet.signMessage({ message, recipient, nonce });
  }, [ensureWallet]);

  const value = useMemo(() => ({ ...state, connect, disconnect, signAndSend, signMessage }), [state, connect, disconnect, signAndSend, signMessage]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export const useWallet = () => useContext(WalletContext);
