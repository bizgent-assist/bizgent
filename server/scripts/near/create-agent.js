// Creates a dedicated agent account for one business and gives it ONLY a function-call
// access key restricted to <vault>.agent_pay. The temporary full-access key is then deleted,
// so the account can do nothing except call agent_pay (which the vault limits by policy).
//   node scripts/near/create-agent.js --vault vault.you.testnet --business acme-1a2b3c [--fund 1] [--allowance 0.5]
import { KeyPair, nearToYocto } from 'near-api-js';
import { Account } from 'near-api-js';
import { arg, operator, provider, saveCredential, txLink, upsertEnv } from './common.js';

const op = operator();
const vaultId = arg('vault', process.env.BIZGENT_CONTRACT_ID);
const business = arg('business');
if (!vaultId || !business) throw new Error('Usage: --vault <vault-id> --business <onchain business id>');
// NEAR account ids are at most 64 chars: fit "<prefix>.<operator>" by keeping the business id's
// unique suffix when the full id does not fit (or pass --prefix explicitly).
const room = 64 - op.accountId.length - 1;
let prefix = arg('prefix', `agent-${business}`).replace(/[^a-z0-9-_]/g, '-');
if (prefix.length > room) prefix = `agent-${business.slice(-(room - 6))}`.replace(/^agent--/, 'agent-');
if (room < 8) throw new Error('Operator account id is too long to host agent sub-accounts');
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
saveCredential(agentId, fc);
upsertEnv('.env', { AGENT_ACCOUNT_ID: agentId, AGENT_PRIVATE_KEY: fc.toString() });
console.log(`\nWrote AGENT_ACCOUNT_ID=${agentId} and its function-call key to server/.env (git-ignored; never printed).`);
console.log('Copy both into the Render service as secret env vars.');
console.log('\nThen, in Bizgent → Agent settings, click "Authorise agent" and sign set_agent with your owner wallet.');
