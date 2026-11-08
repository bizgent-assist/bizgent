// Creates <prefix>.<operator>.testnet, deploys the vault wasm, initialises it and registers
// the vault with the USDC contract (NEP-145 storage_deposit) so it can receive tokens.
//   node scripts/near/deploy-vault.js [--prefix vault] [--wasm ../contracts/vault/target/near/bizgent_vault.wasm] [--fund 5]
import { readFileSync } from 'node:fs';
import { KeyPair, nearToYocto, teraToGas } from 'near-api-js';
import { Account } from 'near-api-js';
import { USDC, arg, operator, provider, txLink, view } from './common.js';

const op = operator();
const prefix = arg('prefix', 'vault');
const vaultId = `${prefix}.${op.accountId}`;
const wasmPath = arg('wasm', '../contracts/vault/target/near/bizgent_vault.wasm');
const fund = arg('fund', '5');
const code = readFileSync(wasmPath);

let vault;
const existing = await provider.viewAccount({ accountId: vaultId, finality: 'final' }).catch(() => null);
if (existing) {
  console.log(`Vault account ${vaultId} already exists. Redeploy requires its key; set VAULT_PRIVATE_KEY.`);
  if (!process.env.VAULT_PRIVATE_KEY) process.exit(1);
  vault = new Account(vaultId, provider, process.env.VAULT_PRIVATE_KEY);
} else {
  const kp = KeyPair.fromRandom('ed25519');
  const res = await op.createSubAccount({ accountOrPrefix: prefix, publicKey: kp.getPublicKey().toString(), nearToTransfer: nearToYocto(fund) });
  console.log(`Created ${vaultId}: ${txLink(res)}`);
  console.log('\nSAVE THIS VAULT KEY OFFLINE (needed only for upgrades; never put it on the server):');
  console.log(`VAULT_PRIVATE_KEY=${kp.toString()}\n`);
  vault = new Account(vaultId, provider, kp.toString());
}

const dep = await vault.deployContract(new Uint8Array(code));
console.log(`Deployed wasm (${code.length} bytes): ${txLink(dep)}`);

if (!existing) {
  const init = await vault.callFunctionRaw({
    contractId: vaultId, methodName: 'new', args: { admin: op.accountId, usdc_contract_id: USDC }, gas: teraToGas('30'),
  });
  console.log(`Initialised (admin=${op.accountId}, usdc=${USDC}): ${txLink(init)}`);
}

const bounds = await view(USDC, 'storage_balance_bounds');
const reg = await view(USDC, 'storage_balance_of', { account_id: vaultId });
if (!reg) {
  const r = await op.callFunctionRaw({
    contractId: USDC, methodName: 'storage_deposit', args: { account_id: vaultId, registration_only: true },
    gas: teraToGas('30'), deposit: BigInt(bounds.min),
  });
  console.log(`Registered vault with USDC (storage_deposit ${bounds.min} yocto): ${txLink(r)}`);
}
console.log('\nConfig:', await view(vaultId, 'get_config'));
console.log(`\nSet in server/.env and client/.env:\n  BIZGENT_CONTRACT_ID=${vaultId}\n  VITE_BIZGENT_CONTRACT_ID=${vaultId}`);
