// Registers an account with the USDC contract (NEP-145 storage_deposit), paid by the operator.
// Recipients must be registered or USDC transfers to them fail (the vault then refunds itself).
//   node scripts/near/register-storage.js --account supplier.testnet
import { teraToGas } from 'near-api-js';
import { USDC, arg, operator, txLink, view } from './common.js';

const account = arg('account');
if (!account) throw new Error('Usage: --account <account-id>');
const existing = await view(USDC, 'storage_balance_of', { account_id: account });
if (existing) {
  console.log(`${account} is already registered with USDC.`);
} else {
  const bounds = await view(USDC, 'storage_balance_bounds');
  const res = await operator().callFunctionRaw({
    contractId: USDC, methodName: 'storage_deposit', args: { account_id: account, registration_only: true },
    gas: teraToGas('30'), deposit: BigInt(bounds.min),
  });
  console.log(`Registered ${account}: ${txLink(res)}`);
}
