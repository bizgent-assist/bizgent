# API (`/api/v1`)

- Auth: HTTP-only cookie `bz_session` (JWT). Same-site via the Vercel `/api` rewrite.
- CSRF: every non-GET request must send `X-Requested-With: bizgent`; `Origin`, if present, must be in `ALLOWED_ORIGINS`.
- Money: **all amounts are integer base-unit strings** (USDC 6 decimals). Never floats.
- Errors: `{ "error": { "code", "message", "details?" } }`. Notable codes: `UNAUTHENTICATED`,
  `SESSION_EXPIRED`, `NOT_FOUND`, `CHAIN_UNAVAILABLE`, `CHAIN_NOT_CONFIGURED`, `AI_UNAVAILABLE`,
  `AI_CREDITS_EXHAUSTED`, `AI_DAILY_LIMIT`, `APPROVAL_INVALIDATED`, `APPROVAL_NOT_PENDING`, `ALREADY_EXECUTING`.
- Every `/businesses/:businessId/*` route verifies the authenticated user owns the business (404 otherwise).

## Public
| | |
|---|---|
| `GET /health` | `{ ok, network }` |
| `GET /config/public` | network, vault & USDC contract ids, decimals, explorer, feature flags. No secrets. |
| `POST /webhooks/brevo?token=` | Brevo delivery events → notification status |

## Auth
`POST /auth/register {name,email,password,businessName}` · `POST /auth/login` · `POST /auth/logout` ·
`GET /auth/me → {user, businesses}` · `PATCH /auth/me {name}` · `POST /auth/change-password` ·
`POST /auth/forgot-password {email}` (always 200) · `POST /auth/reset-password {token,password}` ·
`POST /auth/wallet/challenge → {message, recipient, nonce(base64)}` ·
`POST /auth/wallet/verify {accountId, publicKey, signature}` (NEP-413; key must be FullAccess) · `DELETE /auth/wallet`

## Businesses
`GET /businesses` · `POST /businesses` · `GET|PATCH /businesses/:id` · `GET /:id/dashboard` · `GET /:id/audit-logs`

On-chain owner actions (backend prepares, **owner's wallet signs**, backend re-reads chain):
- `POST /:id/onchain/prepare {action, params}` → `{ transaction: {receiverId, signerId, methodName, args, gas, deposit} }`
  actions: `register_business, set_policy{maxPerTx,dailyLimit}, set_agent, revoke_agent, set_agent_paused{paused}, add_recipient{accountId}, remove_recipient{accountId}, storage_topup`
- `POST /:id/onchain/sync` → refreshes owner, limits, agent and recipient flags from the vault

## Expenses
`GET /:id/expenses?status=outstanding|unpaid|payment_pending|paid|cancelled&category&q&from&to` ·
`POST /:id/expenses {title, amount, category, recipientId?, dueDate?, recurring?, description?}` ·
`GET|PATCH|DELETE /:id/expenses/:eid`. Clients cannot set `paid` — only the verifier does.
Changing amount/recipient invalidates pending approvals (`invalidatedApprovals` in response).

## Recipients
`GET|POST /:id/recipients` · `PATCH|DELETE /:id/recipients/:rid` · `POST /:id/recipients/:rid/check` (re-reads USDC registration and on-chain approval)

## Agent & AI
`GET /:id/agent → {agent, policy, onchain, signer, ai}` · `PATCH /:id/agent {status}` ·
`GET|PATCH /:id/agent/policy {autoApproveBelow, requireApprovalForAll, spendingAlertPercent}` ·
`POST /:id/agent/chat {message} → {message, proposals[], toolTrace[], usage, model}` · `GET /:id/agent/chat`

## Payments
`POST /:id/payments/proposals` — header `Idempotency-Key` (required) — `{recipientId | recipientAccountId, amount, purpose, expenseId?}` →
`{proposal}` where `proposal.decision ∈ auto|needs_approval|rejected` and `status ∈ proposed|awaiting_approval|executing|submitted|completed|failed|rejected|expired|cancelled`.
`auto` proposals are executed immediately by the agent key and verified.
`GET /:id/payments/proposals` · `GET /:id/payments/proposals/:pid` · `POST /:id/payments/proposals/:pid/execute`

## Approvals
`GET /:id/approvals?status` · `GET /:id/approvals/:aid` ·
`POST /:id/approvals/:aid/prepare` → exact `owner_pay` call (checks expiry, details hash, owner wallet) ·
`POST /:id/approvals/:aid/submit {txHash}` → verified transaction ·
`POST /:id/approvals/:aid/reject {note?}`

## Treasury & transactions
`GET /:id/treasury` (live vault read; **503 on RPC failure, never a fabricated zero**) ·
`POST /:id/treasury/deposit/prepare {amount}` → `ft_transfer_call` on USDC ·
`POST /:id/treasury/withdraw/prepare {amount, receiverId?}` → `withdraw` + `requestId` ·
`POST /:id/treasury/submit {type: deposit|withdrawal, txHash, requestId?, amount?, receiverId?}` ·
`GET /:id/treasury/history`
`GET /:id/transactions?type&status&from&to&page&limit` · `GET /:id/transactions/:tid` ·
`POST /:id/transactions/:tid/verify` · `POST /:id/transactions/reverify`

Transaction `status`: `pending` (not yet verifiable) · `confirmed` (outcome + vault record verified) ·
`failed` (on-chain failure / refund) · `mismatch` (signed details differ from what was approved).
