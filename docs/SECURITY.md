# Security model

> Experimental hackathon software. **The vault contract is unaudited.** Testnet only.

## Core guarantee
The AI can act only within permissions granted on-chain; it never has unrestricted control.
- The AI has no key. Its only write tool, `createPaymentProposal`, feeds the deterministic policy engine.
- The agent's key is a **function-call access key** restricted to `<vault>.agent_pay`, on a dedicated
  account whose full-access key is deleted after setup (`create-agent.js`). It cannot attach
  deposits, so it cannot call any owner method (all require 1 yoctoNEAR).
- `agent_pay` enforces, on-chain: caller is the business's agent, agent not paused, recipient
  approved, per-transaction limit, daily limit, balance, unique payment id, vault not paused.
- Worst case if the server and agent key are compromised: payments to **already-approved
  recipients** up to the **daily limit**. The owner can pause/revoke on-chain instantly.
- The function-call key's NEAR gas allowance is not a USDC limit; USDC limits are contract-enforced.

## Financial correctness
- Integer base units everywhere (BigInt in JS, u128 in Rust, `overflow-checks = true`).
- `ft_on_transfer` accepts only the configured USDC contract; bad messages are refunded.
- Balance debited before `ft_transfer`; restored by private callback on failure; idempotent resolution.
- Unique payment ids on-chain + backend idempotency keys + atomic `proposed→executing` claim.
- Recipient USDC storage registration checked before agent payments.
- Approvals bound to a SHA-256 of `(network, vault, business, payment_id, recipient, amount, asset, purpose)`;
  expiry checked on every read; changed expense details invalidate approvals.
- The verifier requires the actual tx outcome **and** the vault's payment record to match the exact
  approved details; a different signed amount/recipient becomes `mismatch`, never success.
- Treasury balance is read live from the contract; RPC failure returns 503 (UI shows "Unavailable", never 0).

## Application security
bcrypt (cost 12) · JWT in HTTP-only, `SameSite=Lax`, `Secure` (prod) cookie · same-site API via
Vercel rewrite · CSRF header + Origin allow-list · CORS restricted to `ALLOWED_ORIGINS` · Helmet ·
rate limits (global, auth, chat) · Joi validation with unknown-field stripping · ownership check on
every business route (404 for others' resources) · generic auth errors and non-enumerating
password reset · append-only audit log · secrets only in server env; public config endpoint
exposes none · production build refuses mock data.

## Email
Email links never execute or approve anything; they open the app, where approval requires an
authenticated session **and** the owner's wallet signature. `sent` = accepted by Brevo, not
delivered; delivery status updates via webhook.

## AI-specific risks
- Prompt injection via expense descriptions/recipient names: the system prompt marks tool data
  as untrusted, tools return data only, one proposal per turn, and policy + contract still apply.
- Amount manipulation: AI amounts are parsed without rounding and must equal the expense amount
  when an expense is referenced.
- Cost: bounded history, tool rounds, output tokens, and a per-business daily request cap.

## Known limitations
- Unaudited contract; admin (deployer) can pause deposits/payments (not withdrawals). The vault
  account's full-access key (kept offline) can upgrade the contract — a centralisation risk.
- One agent signer key per server (MVP: one business). Multi-business needs per-business keys in a KMS.
- Daily limit uses UTC days by block timestamp.
- No 2FA; no multi-member businesses.
- Brevo sender uses a verified single sender until a custom domain is authenticated.
