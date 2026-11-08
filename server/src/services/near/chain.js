// NEAR chain client. All on-chain reads and the (single) agent signing path live here.
// The implementation can be swapped in tests via setChainClient().
import { Account, JsonRpcProvider, actions, baseDecode, teraToGas } from 'near-api-js';
import { verifyMessage } from 'near-api-js/nep413';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/errors.js';

function createRealClient() {
  const provider = new JsonRpcProvider({ url: env.NEAR_RPC_URL });
  const vault = env.BIZGENT_CONTRACT_ID;
  const usdc = env.USDC_CONTRACT_ID;

  const view = async (contractId, method, args = {}) => {
    try {
      return await provider.callFunction({ contractId, method, args, finality: 'final' });
    } catch (err) {
      throw ApiError.unavailable(`NEAR RPC view ${method} failed: ${err.message}`, 'CHAIN_UNAVAILABLE');
    }
  };
  const requireVault = () => {
    if (!vault) throw ApiError.unavailable('Vault contract is not configured (BIZGENT_CONTRACT_ID).', 'CHAIN_NOT_CONFIGURED');
  };

  let agentAccount = null;
  const getAgent = () => {
    if (!env.agentConfigured) {
      throw ApiError.unavailable('Agent signer is not configured (AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY).', 'AGENT_NOT_CONFIGURED');
    }
    agentAccount ??= new Account(env.AGENT_ACCOUNT_ID, provider, env.AGENT_PRIVATE_KEY);
    return agentAccount;
  };

  return {
    vaultId: vault,
    usdcId: usdc,
    async getConfig() { requireVault(); return view(vault, 'get_config'); },
    async getBusiness(businessId) { requireVault(); return (await view(vault, 'get_business', { business_id: businessId })) ?? null; },
    async getPayment(businessId, paymentId) {
      requireVault();
      return (await view(vault, 'get_payment', { business_id: businessId, payment_id: paymentId })) ?? null;
    },
    async isRecipientApproved(businessId, accountId) {
      requireVault();
      return Boolean(await view(vault, 'is_recipient_approved', { business_id: businessId, account_id: accountId }));
    },
    async storageBalanceOf(accountId) { return (await view(usdc, 'storage_balance_of', { account_id: accountId })) ?? null; },
    async ftBalanceOf(accountId) { return String(await view(usdc, 'ft_balance_of', { account_id: accountId })); },
    async ftMetadata() { return view(usdc, 'ft_metadata'); },
    async getTx(txHash, senderId) {
      try {
        return await provider.viewTransactionStatusWithReceipts({ txHash, accountId: senderId, waitUntil: 'EXECUTED_OPTIMISTIC' });
      } catch (err) {
        const msg = String(err?.message || err);
        if (/UNKNOWN_TRANSACTION|doesn't exist|not found|TIMEOUT/i.test(msg)) return null; // not yet known / still processing
        throw ApiError.unavailable(`NEAR RPC tx lookup failed: ${msg}`, 'CHAIN_UNAVAILABLE');
      }
    },
    async accessKeyPermission(accountId, publicKey) {
      try {
        const k = await provider.viewAccessKey({ accountId, publicKey, finality: 'final' });
        return k.permission;
      } catch {
        return null;
      }
    },
    /** Signs `agent_pay` with the agent's FUNCTION-CALL key (zero deposit). */
    async agentPay({ businessId, paymentId, recipient, amount, memo }) {
      requireVault();
      const account = getAgent();
      const action = actions.functionCall(
        'agent_pay',
        { business_id: businessId, payment_id: paymentId, recipient, amount, memo: memo || null },
        teraToGas('100'),
        0n,
      );
      const res = await account.signAndSendTransaction({
        receiverId: vault,
        actions: [action],
        waitUntil: 'EXECUTED_OPTIMISTIC',
        throwOnFailure: false,
      });
      return { txHash: res.transaction.hash, signerId: env.AGENT_ACCOUNT_ID, outcome: res };
    },
    /** NEP-413: verifies the signature AND that the key is a FullAccess key of the account. */
    async verifyNep413({ accountId, publicKey, signatureBase64, message, recipient, nonce }) {
      await verifyMessage({
        signerAccountId: accountId,
        signerPublicKey: publicKey,
        payload: { message, recipient, nonce },
        signature: signatureBase64.startsWith('ed25519:')
          ? baseDecode(signatureBase64.slice('ed25519:'.length))
          : Uint8Array.from(Buffer.from(signatureBase64, 'base64')),
        provider,
      });
      return true;
    },
  };
}

let client = null;
export function chain() {
  client ??= createRealClient();
  return client;
}
export function setChainClient(c) {
  client = c;
}
