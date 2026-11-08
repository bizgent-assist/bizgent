// Creates a dedicated agent account for one business and gives it ONLY a function-call
// access key restricted to <vault>.agent_pay. The temporary full-access key is then deleted,
// so the account can do nothing except call agent_pay (which the vault limits by policy).
//   node scripts/near/create-agent.js --vault vault.you.testnet --business acme-1a2b3c [--fund 1] [--allowance 0.5]
import { KeyPair, nearToYocto } from 'near-api-js';
import { Account } from 'near-api-js';
import { arg, operator, provider, txLink } from './common.js';

const op = operator();
const vaultId = arg('vault', process.env.BIZGENT_CONTRACT_ID);
const business = arg('business');
if (!vaultId || !business) throw new Error('Usage: --vault <vault-id> --business <onchain business id>');
const prefix = `agent-${business}`.slice(0, 40).replace(/[^a-z0-9-_]/g, '-');
const agentId = `${prefix}.${op.accountId}`;

const tmp = KeyPair.fromRandom('ed25519');
const res = await op.createSubAccount({ accountOrPrefix: prefix, publicKey: tmp.getPublicKey().toString(), nearToTransfer: nearToYocto(arg('fund', '1')) });
console.log(`Created ${agentId}: ${txLink(res)}`);

const agentTmp = new Account(agentId, provider, tmp.toString());
const fc = KeyPair.fromRandom('ed25519');
const add = await agentTmp.addFunctionCallAccessKey({
  publicKey: fc.getPublicKey().toString(), contractId: vaultId, methodNames: ['agent_pay'], allowance: nearToYocto(arg('allowance', '0.5')),
});
console.log(`Added function-call key (receiver=${vaultId}, methods=[agent_pay]): ${txLink(add)}`);

if (!process.argv.includes('--keep-full-access')) {
  const del = await agentTmp.deleteKey(tmp.getPublicKey().toString());
  console.log(`Deleted temporary full-access key — account is now locked to agent_pay: ${txLink(del)}`);
}
console.log('\nPut these in the SERVER environment only (Render secret env vars):');
console.log(`AGENT_ACCOUNT_ID=${agentId}`);
console.log(`AGENT_PRIVATE_KEY=${fc.toString()}`);
console.log('\nThen, in Bizgent → Agent settings, click "Authorise agent" and sign set_agent with your owner wallet.');
