# Vault contract interface

`contracts/vault` — Rust, `near-sdk = 5.29.1`. One central contract holding native USDC
(NEP-141) for many businesses, each with a logically isolated balance and policy.

Amounts are `U128` JSON strings in **USDC base units** (6 decimals: `"1000000"` = 1 USDC).

## Roles

| Role | Who | How enforced |
|---|---|---|
| Admin | Account passed to `new` | Can only call `set_paused`. Cannot move business funds. |
| Owner | Account that called `register_business` | All owner methods require **exactly 1 yoctoNEAR** (`assert_one_yocto`) → full-access-key signature |
| Agent | Account set via `set_agent` | Only `agent_pay`, only within policy, only to approved recipients |
| USDC contract | `usdc_contract_id` from `new` | Only caller accepted by `ft_on_transfer` |

Function-call access keys **cannot attach deposits**, so the agent's restricted key can never
call an owner method, even if it were misconfigured.

## Methods

### Init / registration
| Method | Caller | Deposit | Notes |
|---|---|---|---|
| `new(admin, usdc_contract_id)` | deployer | – | `#[init]` |
| `register_business(business_id) -> BusinessView` | future owner | ≥ 0.05 NEAR | id `[a-z0-9_-]{3,40}`; deposit funds the business's storage balance |
| `storage_topup(business_id) -> U128` | anyone | any | adds to storage balance |

### Deposits (NEP-141 receiver)
`ft_on_transfer(sender_id, amount, msg) -> U128` — called by the USDC contract during the
sender's `ft_transfer_call(receiver_id=<vault>, amount, msg='{"business_id":"..."}')`.
- Panics unless `predecessor == usdc_contract_id` (prevents fake deposits).
- Invalid `msg`, unknown business, zero amount, or vault paused → returns the full `amount` (NEP-141 refunds the sender), emits `deposit_refunded`.
- Otherwise credits the business and returns `0`. Emits `deposit`.

### Owner configuration (all require 1 yoctoNEAR, owner only)
`set_policy(business_id, max_per_tx, daily_limit)` · `set_agent(business_id, agent_id)` ·
`revoke_agent(business_id)` · `set_agent_paused(business_id, paused)` ·
`add_recipient(business_id, account_id)` · `remove_recipient(business_id, account_id)`

### Money out
| Method | Caller | Checks |
|---|---|---|
| `withdraw(business_id, request_id, amount, receiver_id?)` | owner, 1 yocto | balance. **Never blocked by pause.** |
| `owner_pay(business_id, payment_id, recipient, amount, memo?)` | owner, 1 yocto | balance, not paused |
| `agent_pay(business_id, payment_id, recipient, amount, memo?)` | the business's agent, **no deposit** | agent set & not paused, recipient approved, `amount ≤ max_per_tx`, `spent_today + amount ≤ daily_limit` (UTC day), balance, vault not paused |

All three: unique `payment_id` per business (`[A-Za-z0-9_-]{6,64}`; duplicate → panic),
recipient ≠ vault/USDC, memo ≤ 140 bytes. The balance is **debited before** the outgoing
`ft_transfer` (1 yoctoNEAR attached by the vault) and a payment record `Pending` is stored.
The private callback `on_transfer_complete` marks it `Completed`, or `Failed` and **restores
the balance** (and the agent's daily allowance for same-day agent payments). Resolution is
idempotent (a second resolution does nothing).

### Admin
`set_paused(paused)` — 1 yocto, admin only. Blocks deposits and payments; withdrawals continue.

### Views
`get_config()` · `get_business(business_id) -> BusinessView | null` · `get_balance(business_id)` ·
`is_recipient_approved(business_id, account_id)` · `get_payment(business_id, payment_id) -> PaymentView | null`

`BusinessView`: `business_id, owner, balance, agent, agent_paused, max_per_tx, daily_limit,
spent_today, remaining_today, recipient_count, storage_balance, created_at`.

`PaymentView`: `business_id, payment_id, kind (AgentPayment|OwnerPayment|Withdrawal), recipient,
amount, memo, status (Pending|Completed|Failed), created_at, signer`.

## Events (NEP-297)
Logged as `EVENT_JSON:{"standard":"bizgent","version":"1.0.0","event":...,"data":[...]}`:
`business_registered, deposit, deposit_refunded, policy_updated, agent_set, agent_revoked,
agent_paused, recipient_added, recipient_removed, payment_started, payment_completed,
payment_failed, vault_paused`.

## Storage
Storage growth of each owner/agent action is measured and charged to the business's storage
balance (NEAR). If insufficient, the call fails — top up with `storage_topup`. The vault
account itself must be registered with the USDC contract (`storage_deposit`) — done by
`npm run near:deploy`. **Recipients must also be registered** with USDC or transfers to them
fail (the callback then refunds the vault balance).

## Gas
Outgoing `ft_transfer` 15 Tgas + callback 15 Tgas; callers attach 100 Tgas.

## Tests
`src/tests.rs` — 20 unit tests covering deposit isolation, fake-token rejection, refunds,
agent limits (per-tx, daily), unapproved recipients, revocation, pause, insufficient balance,
duplicate IDs, failed-transfer restoration, owner-only withdrawal, 1-yocto enforcement,
cross-business agent isolation and storage charging.

Built and tested in CI (`.github/workflows/contract.yml`) because the dev machine's Windows
Smart App Control blocks locally compiled Rust build scripts.
