# Bizgent

**Your business. Powered by intelligence.** Autonomous business financial operations with
human-controlled money — an AI finance agent on NEAR that pays routine bills in native USDC
within limits a smart contract enforces, and asks for the owner's wallet signature for everything else.

> NEAR Hackathon 2026 · Autonomous Business. **Testnet only. Unaudited contract.**

## How it works
1. Ask the assistant: *"Pay our design tool subscription."*
2. The AI finds the expense and creates a proposal — it has no key and cannot decide.
3. A deterministic policy engine checks live vault state: approved recipient, per-payment and daily limits, balance.
4. Within policy → the agent's **function-call key** (only `agent_pay`) pays; the vault contract re-checks everything.
   Outside policy → an approval email; the owner signs the exact `owner_pay` with their own wallet.
5. Bizgent verifies the NEAR transaction outcome and the vault's record before showing **Paid**.

## Repository
```
client/     React + Vite + Tailwind frontend (Vercel)
server/     Express + MongoDB API, AI, Brevo, NEAR services, operator scripts (Render)
contracts/  Rust vault contract (near-sdk 5.29.1), built in GitHub Actions
docs/       ARCHITECTURE · API · CONTRACT_INTERFACE · SECURITY · DEPLOYMENT · TESTNET · IMPLEMENTATION_PLAN
```

## Run locally
```bash
# backend
cd server && cp .env.example .env     # fill JWT_SECRET; others optional for a first run
npm install
npm run dev:memory                    # in-memory MongoDB (no Atlas needed)  — or `npm run dev` with MONGODB_URI
npm test                              # API test suite (24 tests)
# Slow network? mongodb-memory-server downloads ~650 MB once. Point it at a local mongod instead:
#   MONGOMS_SYSTEM_BINARY=/path/to/mongod npm test

# frontend
cd client && cp .env.example .env
npm install
npm run dev                           # http://localhost:5173  (proxies /api to :4000)
```
Without a vault contract, AI key or Brevo key the app still runs: chain features show clear
"not configured" errors (never fake balances), the assistant offers manual payment, and emails
are recorded as `skipped`.

Demo UI without a backend: `VITE_ENABLE_MOCKS=true npm run dev` — every record is labelled
`[DEMO]`, writes are rejected, and production builds refuse this flag.

## Testnet
See [docs/TESTNET.md](docs/TESTNET.md) for accounts, testnet NEAR, Circle testnet USDC,
contract deployment, agent creation and the demo script.

## Environment
- Backend: [`server/.env.example`](server/.env.example) — validated at startup (`server/src/config/env.js`).
- Frontend: [`client/.env.example`](client/.env.example) — public values only.
- Email sender, support address, URLs, network and contract ids are configured only via env.

## Security
See [docs/SECURITY.md](docs/SECURITY.md). Highlights: contract-enforced agent limits,
1-yocto owner methods, predecessor-checked deposits, callback refunds, unique payment ids,
details-hash-bound expiring approvals, on-chain verification, integer base units everywhere.
