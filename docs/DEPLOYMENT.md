# Deployment

## Backend — Render (web service)
- Root directory `server`, build `npm install`, start `npm start`, Node ≥ 20.
- Environment: copy `server/.env.example`. Required: `APP_BASE_URL`, `FRONTEND_URL` (the Vercel URL),
  `ALLOWED_ORIGINS` (the Vercel URL), `MONGODB_URI` (Atlas), `JWT_SECRET` (≥32 random chars),
  `NEAR_RPC_URL`, `USDC_CONTRACT_ID`, `BIZGENT_CONTRACT_ID`; optional `AGENT_*`, `BREVO_*`, `AI_*`.
- `NODE_ENV=production` enforces the official USDC contract and `Secure` cookies.
- `AGENT_PRIVATE_KEY` is a **function-call key only**. Never put the operator or vault key on Render.
- The startup check reads `ft_metadata` and the vault config and fails on a decimals/contract mismatch.
- Free tier sleeps; correctness does not depend on background jobs (expiry is checked on read,
  transactions verified on submit / on demand).

## Frontend — Vercel
- Root `client`, build `npm run build`, output `dist`.
- Edit `client/vercel.json` → replace `REPLACE-WITH-YOUR-RENDER-SERVICE` with the Render host. This rewrite makes
  `/api/*` same-site so the HTTP-only cookie works in all browsers.
- Env (public only): `VITE_API_URL=/api/v1`, `VITE_NEAR_NETWORK`, `VITE_NEAR_RPC_URL`,
  `VITE_BIZGENT_CONTRACT_ID`, `VITE_USDC_CONTRACT_ID`, `VITE_EXPLORER_URL`. Never set `VITE_ENABLE_MOCKS` (the build refuses it).

## MongoDB Atlas
Free M0 cluster; database user with readWrite on `bizgent`; network access for Render egress
(or 0.0.0.0/0 for the hackathon with a strong password).

## Brevo
1. Create an API key (SMTP & API → API keys) → `BREVO_API_KEY`.
2. Senders & IPs → add and verify a sender address → `BREVO_SENDER_EMAIL`. Without an authenticated
   domain, deliverability from free-mail addresses may be poor (DMARC); authenticate a domain later
   and only change `BREVO_SENDER_EMAIL` — no code changes.
3. Optional webhook: `https://<vercel-or-render>/api/v1/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>`.

## NEAR AI Cloud
Create an API key at cloud.near.ai → `AI_API_KEY`. Default `AI_MODEL=anthropic/claude-haiku-5-5`
($0.10 / $0.50 per M tokens at time of writing). Verify with `npm run ai:smoke` before the demo.
Set any spending limit available in the NEAR AI dashboard; the app also caps requests per day
(`AI_DAILY_REQUEST_LIMIT`).

## Contract
Built in GitHub Actions (`contract` workflow) → artifact `bizgent-vault-wasm` → deployed with
`npm run near:deploy` from the operator's machine (see TESTNET.md). Mainnet is out of scope for
this MVP; enabling it requires a separate verified deployment, `NEAR_NETWORK=mainnet`, mainnet
contract ids and `MAINNET_ENABLED=true`.
