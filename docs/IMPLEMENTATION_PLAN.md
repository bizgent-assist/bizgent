# Implementation plan & progress

Deadline: **2026-11-14**. Scope: reduced MVP on **NEAR testnet only**.

## Order chosen
Contract interface + contract first (it defines ids, statuses and permissions), then backend
with a simulated chain client for tests, then frontend against the real API contract, then
testnet integration. Rationale: the riskiest financial logic is validated earliest, and the UI
never has to be reworked around contract semantics.

## Progress checklist
### Contract (`contracts/vault`)
- [x] Vault with isolated business balances, owner, agent, policy, approved recipients
- [x] `ft_on_transfer` with predecessor check + refunds; `ft_transfer` with 1 yocto + callback restore
- [x] Unique payment ids, daily/per-tx limits, pause (withdrawals exempt), storage accounting, NEP-297 events
- [x] 20 unit tests — **all passing in CI** (local Rust builds are blocked by Windows Smart App Control)
- [x] Wasm built in CI (`bizgent_vault.wasm`, 199,564 bytes, sha256 `f132ad550e4e7eb734f5c34d88861e610f1a3f593851308cd46dfa7e83f3a121`)
- [ ] Deployed to testnet — **needs operator testnet account** (see below)

### Backend (`server`)
- [x] Validated central config, network/USDC cross-checks, mainnet opt-in guard
- [x] Models, auth (bcrypt, JWT cookie), CSRF, CORS, Helmet, rate limits, ownership scoping
- [x] NEP-413 wallet linking (near-api-js `verifyMessage`, FullAccess key check)
- [x] Deterministic policy engine; proposals with idempotency; atomic agent execution
- [x] Approvals bound to details hash, expiry, invalidation; owner_pay preparation
- [x] On-chain verifier (outcome + events + vault record); deposits, withdrawals
- [x] NEAR AI Cloud provider (OpenAI-compatible), controlled tools, cost caps, AI-unavailable fallback
- [x] Brevo email + templates + webhook status; audit log
- [x] Operator scripts: deploy vault, create locked agent, register storage, status; AI smoke test
- [x] API test suite (in-memory MongoDB + simulated vault) — **24/24 passing**
- [x] Live testnet RPC check: official USDC contract reports `USDC`, 6 decimals; NEP-145 storage checks work

### Frontend (`client`)
- [x] Design system, layouts, responsive navigation, network/demo banners
- [x] All 15 pages (+ recipients, approval detail, reset password)
- [x] API service layer, loading/empty/error/retry states, session-expiry redirect
- [x] Dev-only mock adapter stripped from production builds
- [x] Wallet (near-connect): link, sign & send, prepare → sign → verify flows
- [x] Production build passes; mock code absent from the production bundle
- [x] Browser walkthrough: register → dashboard → recipient (live USDC check) → expense → payment → approval page

### Integration (needs credentials — see below)
- [ ] NEAR AI model verified with `npm run ai:smoke`
- [ ] Brevo sender verified, emails received
- [ ] End-to-end testnet demo (TESTNET.md §5)
- [ ] Vercel + Render + Atlas deployed

## Credentials / actions needed from the owner
| Item | Where it goes |
|---|---|
| Testnet operator account + private key | `server/.env.operator` (local only) |
| Testnet NEAR + Circle testnet USDC | wallets |
| MongoDB Atlas connection string | `MONGODB_URI` (or `npm run dev:memory` locally) |
| Brevo API key + verified sender | `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` |
| NEAR AI Cloud API key | `AI_API_KEY` |

## AI cost estimate
Default model `anthropic/claude-haiku-5-5` via NEAR AI Cloud: $0.10 input / $0.50 output per
million tokens (public model list, 2026-11-08). A chat turn is ~2–4k input + ≤600 output tokens
across ≤3 tool rounds → **≈ $0.0005–0.001 per message**. 1,000 demo/test messages ≈ **$1**.
Cheaper alternatives with tool support: `openai/gpt-5-nano` ($0.05/$0.40),
`z-ai/glm-5.3-flash` ($0.08/$0.50). No credits are purchased by the app; the daily request
cap (`AI_DAILY_REQUEST_LIMIT`, default 100) bounds spend. Whether NEAR AI Cloud grants free
credits to new accounts is not stated in its docs — check the dashboard after sign-up.

## Postponed (out of MVP)
NEAR Intents deposits · WhatsApp · invoice uploads · team members · multi-business switcher UI ·
direct Claude provider · mainnet.
