# Architecture

```
Owner browser ── React/Vite (Vercel) ──/api rewrite──► Express API (Render) ──► MongoDB Atlas
     │                                                    │  ├─► NEAR AI Cloud (OpenAI-compatible, tool calling)
     │ owner wallet (near-connect) signs:                 │  ├─► Brevo (transactional email + webhook)
     │   ft_transfer_call (deposit) on USDC               │  └─► NEAR RPC (views, tx status)
     │   register / set_policy / set_agent / recipients   │
     │   owner_pay (approvals) / withdraw                 ▼ agent FUNCTION-CALL key (agent_pay only)
     └──────────────────────────────► Bizgent Vault (Rust) ──ft_transfer──► native USDC (NEP-141)
```

## Responsibilities
| Layer | Decides | Never does |
|---|---|---|
| AI (NEAR AI Cloud) | Interprets requests, calls read tools, may create **one** proposal per turn | Sign, approve, change policy, choose the decision |
| Policy engine (`server/src/services/payments/policy.js`) | `auto` / `needs_approval` / `rejected`, from live on-chain state | Loosen contract limits |
| Vault contract | Authoritative balances, limits, approved recipients, agent identity, payment uniqueness | Trust the backend |
| Owner wallet | Every owner action and every out-of-policy payment | – |
| Verifier (`services/near/verifier.js`) | `confirmed/failed/mismatch/pending` from tx outcome **and** vault record | Mark success from an API response |

## Payment flows
1. **Agent (within policy):** proposal → policy `auto` → atomic claim (`proposed→executing`) → live re-check → `agent_pay` signed by the agent's FC key → Transaction `pending` → verifier → `completed`, expense `paid`, email.
2. **Owner approval:** proposal → `needs_approval` → Approval (details hash, expiry) + Brevo email (link only opens the page) → owner `prepare` (re-checks hash/expiry/owner wallet) → wallet signs `owner_pay` → `submit(txHash)` → verifier checks signer, method, **exact args**, events and vault record.
3. **Deposit:** wallet signs `ft_transfer_call(vault, amount, {"business_id"})` → verifier requires the vault's `deposit` event for this business.
4. **Withdrawal:** owner wallet signs `withdraw` → verified like a payment.

## Data
MongoDB models (`server/src/models/index.js`): User, Business, Recipient, Expense, Agent,
AgentPolicy, PaymentProposal, Approval, Transaction, Notification, ChatMessage, AuditLog (append-only).
All money fields are integer base-unit strings. Every business route is scoped by `loadBusiness`
(owner check) and every query filters by `businessId`. The backend caches on-chain values
(policy mirrors, recipient flags) but treasury balances are always read live from the vault.

## Frontend
`client/src`: `config/env.js` (public config), `services/api` (single API layer), `mocks/`
(dev-only demo adapter, stripped from production builds), `context/` (auth, config + network
mismatch guard, wallet), `hooks/useApi` (loading/error/retry), `hooks/useWalletFlow`
(prepare → sign → verify), `components/Money` (only money renderer; token vs USD labelling).

## Configuration
Backend: `server/src/config/env.js` validates every variable with Joi at startup and refuses
mainnet without `MAINNET_ENABLED=true`, bridged USDC.e, or contract ids from the wrong network.
Official USDC ids live once in `server/src/config/networks.js` for cross-checking.
