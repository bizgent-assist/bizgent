# Bizgent — NEAR HACKATHON 2026 submission notes

Rules followed: https://nearhackathon.com/HACKATHON.md (read 2026-11-10). Deadline 2026-11-14 23:59 UTC.

## Links
- Repository: https://github.com/bizgent-assist/bizgent
- Live app: https://bizgent.vercel.app
- API health: https://bizgent-api.onrender.com/api/v1/health
- Vault contract (testnet): https://testnet.nearblocks.io/address/vault.bizgent-operator-jayflint-2026-testnet.testnet

## Tracks
| Track (id) | Why it fits — implemented features only |
|---|---|
| **AI Security & Defense** (`security`) — primary | Spending limits and approved-recipient allowlist enforced *in the contract*; the agent holds only a function-call key restricted to `agent_pay`; per-payment and daily limits; unique payment ids; revocation/pause on-chain; owner-only 1-yocto methods; approvals bound to a details hash; on-chain verification before "Paid". Each rule has a failing testnet transaction as evidence (README table). |
| **Autonomous Business** (`business`) | An AI agent runs a small business's treasury operations: tracks expenses, proposes and executes routine USDC payments to suppliers, escalates exceptions to the owner. |
| **Real-World Money** (`realworld`) | Native Circle USDC (NEP-141) rails for supplier/bill payments with deposits, payments, withdrawals and audit history. Testnet only. |

Not claimed: Agent Economy (the agent doesn't earn, negotiate or buy services from other agents), DeFi, Intents, Chain Signatures.

## Project description (for the `idea` field, < 2,000 chars)
> Bizgent is an AI finance agent for small businesses that pays routine bills in USDC on NEAR — inside spending limits enforced by a smart contract, not by the AI. The owner deposits native USDC into an isolated balance in the Bizgent vault contract and sets, on-chain, a per-payment limit, a daily limit and a list of approved recipients. A dedicated agent account holds only a function-call key that can call one method, agent_pay; the contract re-checks the agent, recipient, both limits, balance and a unique payment id on every call. Payments outside policy become approvals: the owner is emailed, logs in and signs the exact owner_pay transaction in their own wallet — an email link never moves money. The backend verifies each NEAR transaction outcome, contract event and vault record before showing "Paid". An assistant on NEAR AI Cloud reads expenses and proposes payments through the same policy engine; it has no key. Built during the hackathon: Rust vault contract (deployed on testnet), Express/MongoDB API, React app (live on Vercel/Render), with testnet transactions proving each enforcement rule (over-limit, unapproved recipient, replay, revoked agent all rejected by the contract).

## Demo script (2–3 min)
1. **Problem (15 s)** — "Small businesses want an AI to pay routine bills, but an AI with a wallet can drain it. Bizgent lets the chain set the limits."
2. **Dashboard (20 s)** — Jayflint Studio: balance read live from the vault contract, verified payments, TESTNET banner.
3. **Agent & policy (25 s)** — agent account, "only `agent_pay`", limits 2 USDC / 5 USDC per day stored in the contract. Open the agent account on NearBlocks → its single function-call key.
4. **Autonomous payment (35 s)** — in the AI assistant: *"Pay the design tool subscription."* → the AI proposes, policy says *auto* → **Confirmed** → click the NearBlocks link: signer is the agent, `agent_pay` on the vault, USDC `ft_transfer` to the supplier.
5. **Exception (35 s)** — 3 USDC expense → *needs approval* → approval email → open approval → wallet shows exactly `owner_pay` 3 USDC → sign → Confirmed.
6. **Defense (25 s)** — show the README table: contract-rejected transactions (over limit, unapproved recipient, replayed id, wrong caller, revoked agent).
7. **Close (10 s)** — "Built at NEAR HACKATHON: Rust vault, function-call keys, native USDC. Testnet. Feedback welcome — what limits would you want your AI agent to have?"

Best screens: `docs/screenshots/02-dashboard.png`, `04-agent-policy.png`, `03-treasury.png`, `05-transactions.png`, the ApprovalDetail page, NearBlocks pages for the agent account and an `agent_pay` transaction.

## X post draft (human posts it — never automated)
> Built at NEAR HACKATHON: Bizgent 🧾🤖
>
> Small businesses want AI to pay routine bills — but an AI with a wallet can drain it.
>
> Bizgent's agent pays suppliers in USDC on @NEARProtocol, but only within limits the smart contract enforces: approved recipients, per-payment + daily caps, and a function-call key that can call exactly one method. Anything else needs the owner's wallet signature.
>
> Demo 👇 (testnet)
> App: https://bizgent.vercel.app
> Code: https://github.com/bizgent-assist/bizgent
>
> What limits would you give your AI finance agent?
>
> #NEARHackathon @NearLegion @NearBuilders

Attach the demo video (or screenshots from `docs/screenshots/`).

## Submission payload (draft — submit ONLY after the human confirms every value)
`POST https://nearhackathon.com/api/applications` or the form at https://nearhackathon.com/#apply. One submission per repo; never resubmit — use https://nearhackathon.com/request-changes.
```json
{
  "requestId": "<generate one UUID and reuse it on retries>",
  "projectName": "Bizgent",
  "leadName": "<your name>",
  "email": "<your email>",
  "size": "1",
  "tracks": ["security", "business", "realworld"],
  "nearAddress": "<your MAINNET account for payout, e.g. name.near>",
  "projectUrl": "https://github.com/bizgent-assist/bizgent",
  "demoUrl": "<URL of your X demo post>",
  "idea": "<the project description above>",
  "consent": true
}
```

## Final checklist
- [x] Repository public, MIT LICENSE, README with judge walkthrough and disclosures
- [x] Contract deployed on testnet; real transactions linked in README
- [x] Frontend and backend live; health endpoint verified
- [x] No secrets in the repository or its history (scanned)
- [x] NEAR AI live on the hosted app (assistant answered and paid a real expense on testnet)
- [ ] Record a 2–3 min demo video
- [ ] Publish the X post (tags @NEARProtocol, #NEARHackathon)
- [ ] Fill the payload above, review it, then submit once
- [ ] Keep the app, contract and repo up through judging (ideally until 2026-11-25)
