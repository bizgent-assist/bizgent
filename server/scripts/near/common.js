// Operator tooling (runs on the developer's machine, NOT on the server).
// Reads operator credentials from server/.env.operator (git-ignored). The operator key is a
// full-access key for the operator's own testnet account and must never be deployed.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { Account, JsonRpcProvider } from 'near-api-js';

const file = resolve(process.cwd(), '.env.operator');
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const NETWORK = process.env.NEAR_NETWORK || 'testnet';
if (NETWORK !== 'testnet') {
  throw new Error('Operator scripts are restricted to testnet in this MVP.');
}
export const RPC = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
export const USDC = process.env.USDC_CONTRACT_ID || '3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
export const provider = new JsonRpcProvider({ url: RPC });

export function operator() {
  const id = process.env.OPERATOR_ACCOUNT_ID;
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!id || !key) throw new Error('Set OPERATOR_ACCOUNT_ID and OPERATOR_PRIVATE_KEY in server/.env.operator');
  if (!id.endsWith('.testnet')) throw new Error('OPERATOR_ACCOUNT_ID must be a .testnet account');
  return new Account(id, provider, key);
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

export const view = (contractId, method, args = {}) => provider.callFunction({ contractId, method, args, finality: 'final' });

export function txLink(res) {
  return `https://testnet.nearblocks.io/txns/${res.transaction.hash}`;
}

// Secrets are never printed. Keys go to the NEAR CLI credential store (outside the repo)
// and/or to a git-ignored env file in server/.
export function saveCredential(accountId, keyPair) {
  const dir = join(homedir(), '.near-credentials', NETWORK);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${accountId}.json`);
  writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: keyPair.getPublicKey().toString(), private_key: keyPair.toString() }), { mode: 0o600 });
  return file;
}

export function upsertEnv(fileName, vars) {
  const file = resolve(process.cwd(), fileName);
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.replace(/\s*$/, '')}\n${k}=${v}\n`;
  }
  writeFileSync(file, text);
  return file;
}
