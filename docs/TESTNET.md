# Testnet setup and demo

Testnet tokens have **no real value**. Never present them as real funds.

## 1. Accounts
Create a testnet account in a wallet that supports testnet (e.g. MyNearWallet testnet or Meteor).
You need:
- **Operator** account (you, e.g. `yourname.testnet`) — deploys the vault and creates the agent. Its key stays on your machine.
- **Owner** wallet — signs owner actions in the app (can be the same as the operator for the demo).
- **Supplier** account — a second testnet account to receive payments.

## 2. Testnet NEAR (gas, storage)
Use the faucet listed in NEAR docs (docs.near.org → Faucet). Operator needs ~8 NEAR
(vault 5, agent 1, storage, gas); owner needs ~1 NEAR.

## 3. Testnet USDC (native, Circle)
Official testnet contract (Circle, verified 2026-11-08):
`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
Get it from Circle's public faucet (faucet.circle.com → NEAR Testnet → your owner account).
Do **not** use other "USDC" test tokens (e.g. DEX swaps or other faucets) — the vault only
accepts the configured contract and refunds anything else.
Your wallet must be registered with the USDC contract to hold it (the faucet/wallet usually
handles this; otherwise run `npm run near:register-storage -- --account <you>.testnet`).

## 4. Deploy (from `server/`)
```bash
# server/.env.operator  (git-ignored — never commit, never deploy)
OPERATOR_ACCOUNT_ID=yourname.testnet
OPERATOR_PRIVATE_KEY=ed25519:...

# 1. Get the wasm from CI (GitHub Actions "contract" workflow artifact)
gh run download --name bizgent-vault-wasm -D ../contracts/vault/target/near
# 2. Create vault.yourname.testnet, deploy, init, register vault with USDC
npm run near:deploy
# 3. Register the business in the app first (Business settings → Register), copy its Business ID, then:
npm run near:create-agent -- --vault vault.yourname.testnet --business <business-id>
# 4. Register the supplier with USDC so it can receive tokens
npm run near:register-storage -- --account supplier.testnet
# 5. Check everything
npm run near:status -- --vault vault.yourname.testnet --business <business-id> --agent <agent-account>
```
Put `BIZGENT_CONTRACT_ID`, `AGENT_ACCOUNT_ID`, `AGENT_PRIVATE_KEY` in `server/.env` and
`VITE_BIZGENT_CONTRACT_ID` in `client/.env`, then restart.

## 5. Demo script
1. Register → Profile: **Connect & link wallet** (NEP-413 signature).
2. Business settings → **Register with wallet** (0.1 NEAR storage).
3. Treasury → **Deposit** e.g. 25 USDC → verified `deposit` event.
4. Agent & policy → **Authorise agent**, set limits (e.g. 5 per payment, 20 daily).
5. Recipients → add supplier → **Approve** on-chain.
6. Expenses → "Design tool subscription", 3 USDC, supplier.
7. Assistant: *"Pay the design tool subscription"* → agent pays → **Verified on-chain** with explorer link.
8. Assistant: *"Pay the supplier 12 USDC for printing"* → **Needs approval** (over limit) → email → Approvals → **Approve & sign**.
9. Try a 50 USDC agent payment → rejected/needs approval; show contract limits.
10. Agent & policy → **Revoke** → further agent payments require approval.
11. Treasury → **Withdraw**.
