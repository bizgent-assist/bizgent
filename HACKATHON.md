# Bizgent — NEAR Hackathon 2026 submission

**Category:** Autonomous Business · **Network:** NEAR testnet · **Asset:** native USDC (Circle)

## One-line pitch
An AI finance agent for small businesses that can pay routine bills by itself — but only
inside limits enforced by a NEAR smart contract, with the owner's wallet signature required
for everything else.

## What is real
- Rust vault contract on NEAR testnet: isolated business balances, NEP-141 deposits via
  `ft_transfer_call`, owner withdrawals, contract-enforced agent limits and approved recipients.
- A dedicated agent account whose only key is a function-call key for `agent_pay`.
- NEAR AI Cloud model with tool calling over the business's real records.
- Owner approvals signed in the owner's own wallet, triggered by Brevo email.
- Every payment verified from the NEAR transaction outcome and the vault record, with NearBlocks links.

## Demo (≈3 minutes)
See [docs/TESTNET.md §5](docs/TESTNET.md). Key moments: AI pays a subscription autonomously
within policy → over-limit payment requires the owner's signature → revoked agent can no longer pay.

## Not included (by design, for the deadline)
NEAR Intents, WhatsApp, invoice uploads, team members, mainnet.
