//! Bizgent Vault
//!
//! One central contract that holds native USDC (NEP-141) on behalf of many businesses.
//! Each business has a logically isolated balance, an owner (a NEAR account) and an
//! optional agent account that may pay *approved recipients* within *contract-enforced*
//! per-transaction and daily limits.
//!
//! Security model (see docs/CONTRACT_INTERFACE.md):
//! - Deposits only arrive through `ft_transfer_call` on the configured USDC contract;
//!   `ft_on_transfer` rejects any other caller, and unknown/invalid messages are refunded.
//! - All owner methods require exactly 1 yoctoNEAR, which forces a full-access-key
//!   (wallet-confirmed) signature. Function-call access keys cannot attach deposits, so the
//!   agent's restricted key can never call an owner method.
//! - Balances are debited *before* the outgoing `ft_transfer` and restored in a private
//!   callback if the transfer fails (e.g. recipient not storage-registered).
//! - Payment IDs are unique per business; a repeated ID is rejected (no double payment).
//! - Withdrawals by the owner are never blocked by the global pause.

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PromiseResult,
};

pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
pub const GAS_CALLBACK: Gas = Gas::from_tgas(15);
pub const MIN_REGISTRATION_DEPOSIT: NearToken = NearToken::from_millinear(50); // 0.05 NEAR
pub const MAX_RECIPIENTS: u32 = 100;
pub const NANOS_PER_DAY: u64 = 86_400_000_000_000;
pub const EVENT_STANDARD: &str = "bizgent";
pub const EVENT_VERSION: &str = "1.0.0";

#[ext_contract(ext_ft)]
#[allow(dead_code)]
pub trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum PaymentKind {
    AgentPayment,
    OwnerPayment,
    Withdrawal,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Business {
    pub owner: AccountId,
    pub balance: u128,
    pub agent: Option<AccountId>,
    pub agent_paused: bool,
    pub max_per_tx: u128,
    pub daily_limit: u128,
    pub spent_day: u64,
    pub spent_today: u128,
    pub recipient_count: u32,
    /// yoctoNEAR available to pay for this business's on-chain storage.
    pub storage_balance: u128,
    pub created_at: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Payment {
    pub business_id: String,
    pub payment_id: String,
    pub kind: PaymentKind,
    pub recipient: AccountId,
    pub amount: u128,
    pub memo: Option<String>,
    pub status: PaymentStatus,
    pub day: u64,
    pub created_at: u64,
    pub signer: AccountId,
}

#[near(serializers = [json])]
pub struct BusinessView {
    pub business_id: String,
    pub owner: AccountId,
    pub balance: U128,
    pub agent: Option<AccountId>,
    pub agent_paused: bool,
    pub max_per_tx: U128,
    pub daily_limit: U128,
    pub spent_today: U128,
    pub remaining_today: U128,
    pub recipient_count: u32,
    pub storage_balance: U128,
    pub created_at: u64,
}

#[near(serializers = [json])]
pub struct PaymentView {
    pub business_id: String,
    pub payment_id: String,
    pub kind: PaymentKind,
    pub recipient: AccountId,
    pub amount: U128,
    pub memo: Option<String>,
    pub status: PaymentStatus,
    pub created_at: u64,
    pub signer: AccountId,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub admin: AccountId,
    pub usdc_contract_id: AccountId,
    pub paused: bool,
}

#[near(serializers = [json])]
struct DepositMsg {
    business_id: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    admin: AccountId,
    usdc: AccountId,
    paused: bool,
    businesses: LookupMap<String, Business>,
    payments: LookupMap<String, Payment>,
    /// Approved recipients keyed by usiness_id|account_id (LookupMap so storage can be flushed and measured).
    recipients: LookupMap<String, bool>,
}

fn today() -> u64 {
    env::block_timestamp() / NANOS_PER_DAY
}

fn payment_key(business_id: &str, payment_id: &str) -> String {
    format!("{business_id}:{payment_id}")
}

fn recipient_key(business_id: &str, account: &AccountId) -> String {
    format!("{business_id}|{account}")
}

fn valid_id(s: &str, min: usize, max: usize, allow_upper: bool) -> bool {
    s.len() >= min
        && s.len() <= max
        && s.bytes().all(|b| {
            b.is_ascii_lowercase()
                || b.is_ascii_digit()
                || b == b'-'
                || b == b'_'
                || (allow_upper && b.is_ascii_uppercase())
        })
}

fn emit(event: &str, data: serde_json::Value) {
    let payload = json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[near]
impl Vault {
    #[init]
    pub fn new(admin: AccountId, usdc_contract_id: AccountId) -> Self {
        Self {
            admin,
            usdc: usdc_contract_id,
            paused: false,
            businesses: LookupMap::new(b"b"),
            payments: LookupMap::new(b"p"),
            recipients: LookupMap::new(b"r"),
        }
    }

    // ------------------------------------------------------------------ registration

    /// Registers a business. The caller becomes its owner. The attached NEAR funds the
    /// business's storage balance (minimum 0.05 NEAR); storage used is charged against it.
    #[payable]
    pub fn register_business(&mut self, business_id: String) -> BusinessView {
        require!(valid_id(&business_id, 3, 40, false), "Invalid business_id");
        require!(!self.businesses.contains_key(&business_id), "Business already exists");
        let deposit = env::attached_deposit();
        require!(deposit >= MIN_REGISTRATION_DEPOSIT, "Attach at least 0.05 NEAR for storage");
        let before = env::storage_usage();
        let now = env::block_timestamp();
        self.businesses.insert(
            business_id.clone(),
            Business {
                owner: env::predecessor_account_id(),
                balance: 0,
                agent: None,
                agent_paused: false,
                max_per_tx: 0,
                daily_limit: 0,
                spent_day: today(),
                spent_today: 0,
                recipient_count: 0,
                storage_balance: deposit.as_yoctonear(),
                created_at: now,
            },
        );
        self.charge_storage(&business_id, before);
        emit(
            "business_registered",
            json!({ "business_id": business_id, "owner": env::predecessor_account_id() }),
        );
        self.get_business(business_id).unwrap()
    }

    /// Anyone may top up a business's storage balance.
    #[payable]
    pub fn storage_topup(&mut self, business_id: String) -> U128 {
        let deposit = env::attached_deposit().as_yoctonear();
        let biz = self.business_mut(&business_id);
        biz.storage_balance += deposit;
        U128(biz.storage_balance)
    }

    // ------------------------------------------------------------------ deposits (NEP-141)

    /// NEP-141 receiver. Only the configured USDC contract may call this. `msg` must be
    /// `{"business_id":"..."}` for a registered business; otherwise the full amount is
    /// returned to the sender (refund) and nothing is credited.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.usdc,
            "Only the configured USDC contract can deposit"
        );
        if self.paused || amount.0 == 0 {
            return PromiseOrValue::Value(amount);
        }
        let parsed: Option<DepositMsg> = serde_json::from_str(&msg).ok();
        let Some(DepositMsg { business_id }) = parsed else {
            emit("deposit_refunded", json!({ "sender_id": sender_id, "amount": amount, "reason": "invalid_msg" }));
            return PromiseOrValue::Value(amount);
        };
        let Some(biz) = self.businesses.get_mut(&business_id) else {
            emit("deposit_refunded", json!({ "sender_id": sender_id, "amount": amount, "reason": "unknown_business" }));
            return PromiseOrValue::Value(amount);
        };
        biz.balance = biz.balance.checked_add(amount.0).expect("Balance overflow");
        emit(
            "deposit",
            json!({ "business_id": business_id, "sender_id": sender_id, "amount": amount, "balance": U128(biz.balance) }),
        );
        PromiseOrValue::Value(U128(0))
    }

    // ------------------------------------------------------------------ owner configuration

    #[payable]
    pub fn set_policy(&mut self, business_id: String, max_per_tx: U128, daily_limit: U128) {
        let biz = self.owner_business_mut(&business_id);
        require!(max_per_tx.0 <= daily_limit.0, "max_per_tx cannot exceed daily_limit");
        biz.max_per_tx = max_per_tx.0;
        biz.daily_limit = daily_limit.0;
        emit(
            "policy_updated",
            json!({ "business_id": business_id, "max_per_tx": max_per_tx, "daily_limit": daily_limit }),
        );
    }

    #[payable]
    pub fn set_agent(&mut self, business_id: String, agent_id: AccountId) {
        let current = env::current_account_id();
        let usdc = self.usdc.clone();
        let biz = self.owner_business_mut(&business_id);
        require!(agent_id != biz.owner, "Agent must differ from owner");
        require!(agent_id != current && agent_id != usdc, "Invalid agent account");
        biz.agent = Some(agent_id.clone());
        biz.agent_paused = false;
        emit("agent_set", json!({ "business_id": business_id, "agent_id": agent_id }));
    }

    #[payable]
    pub fn revoke_agent(&mut self, business_id: String) {
        let biz = self.owner_business_mut(&business_id);
        let old = biz.agent.take();
        emit("agent_revoked", json!({ "business_id": business_id, "agent_id": old }));
    }

    #[payable]
    pub fn set_agent_paused(&mut self, business_id: String, paused: bool) {
        let biz = self.owner_business_mut(&business_id);
        biz.agent_paused = paused;
        emit("agent_paused", json!({ "business_id": business_id, "paused": paused }));
    }

    #[payable]
    pub fn add_recipient(&mut self, business_id: String, account_id: AccountId) {
        let before = env::storage_usage();
        require!(account_id != env::current_account_id() && account_id != self.usdc, "Invalid recipient");
        let key = recipient_key(&business_id, &account_id);
        {
            let biz = self.owner_business_mut(&business_id);
            require!(biz.recipient_count < MAX_RECIPIENTS, "Recipient limit reached");
            require!(account_id != biz.owner, "Owner does not need to be a recipient");
        }
        if self.recipients.insert(key, true).is_none() {
            self.business_mut(&business_id).recipient_count += 1;
            self.charge_storage(&business_id, before);
            emit("recipient_added", json!({ "business_id": business_id, "account_id": account_id }));
        }
    }

    #[payable]
    pub fn remove_recipient(&mut self, business_id: String, account_id: AccountId) {
        let before = env::storage_usage();
        self.owner_business_mut(&business_id);
        if self.recipients.remove(&recipient_key(&business_id, &account_id)).is_some() {
            let biz = self.business_mut(&business_id);
            biz.recipient_count = biz.recipient_count.saturating_sub(1);
            self.charge_storage(&business_id, before);
            emit("recipient_removed", json!({ "business_id": business_id, "account_id": account_id }));
        }
    }

    // ------------------------------------------------------------------ money out

    /// Owner withdrawal. Never blocked by the global pause.
    #[payable]
    pub fn withdraw(
        &mut self,
        business_id: String,
        request_id: String,
        amount: U128,
        receiver_id: Option<AccountId>,
    ) -> Promise {
        self.owner_business_mut(&business_id);
        let receiver = receiver_id.unwrap_or_else(env::predecessor_account_id);
        self.start_transfer(business_id, request_id, PaymentKind::Withdrawal, receiver, amount.0, None)
    }

    /// Owner-signed payment to any recipient (owner authority; balance-limited only).
    #[payable]
    pub fn owner_pay(
        &mut self,
        business_id: String,
        payment_id: String,
        recipient: AccountId,
        amount: U128,
        memo: Option<String>,
    ) -> Promise {
        require!(!self.paused, "Vault is paused");
        self.owner_business_mut(&business_id);
        self.start_transfer(business_id, payment_id, PaymentKind::OwnerPayment, recipient, amount.0, memo)
    }

    /// Agent payment. Callable only by the business's active agent, only to approved
    /// recipients, and only within max_per_tx and the daily limit. Not payable, so it
    /// can be signed by a function-call access key restricted to this method.
    pub fn agent_pay(
        &mut self,
        business_id: String,
        payment_id: String,
        recipient: AccountId,
        amount: U128,
        memo: Option<String>,
    ) -> Promise {
        require!(!self.paused, "Vault is paused");
        let caller = env::predecessor_account_id();
        let approved = self.recipients.contains_key(&recipient_key(&business_id, &recipient));
        let biz = self.business_mut(&business_id);
        require!(biz.agent.as_ref() == Some(&caller), "Caller is not this business's agent");
        require!(!biz.agent_paused, "Agent is paused");
        require!(approved, "Recipient is not approved for agent payments");
        require!(amount.0 > 0, "Amount must be positive");
        require!(amount.0 <= biz.max_per_tx, "Amount exceeds per-transaction limit");
        let day = today();
        if biz.spent_day != day {
            biz.spent_day = day;
            biz.spent_today = 0;
        }
        let new_spent = biz.spent_today.checked_add(amount.0).expect("Overflow");
        require!(new_spent <= biz.daily_limit, "Amount exceeds remaining daily limit");
        biz.spent_today = new_spent;
        self.start_transfer(business_id, payment_id, PaymentKind::AgentPayment, recipient, amount.0, memo)
    }

    /// Private callback: finalises a payment. On failure restores the balance (and the
    /// daily allowance for same-day agent payments).
    #[private]
    pub fn on_transfer_complete(&mut self, payment_key: String) -> bool {
        let success = env::promise_results_count() == 1
            && matches!(env::promise_result(0), PromiseResult::Successful(_));
        self.resolve_transfer(&payment_key, success)
    }

    // ------------------------------------------------------------------ admin

    /// Global emergency pause: blocks deposits and payments. Owner withdrawals continue.
    #[payable]
    pub fn set_paused(&mut self, paused: bool) {
        near_sdk::assert_one_yocto();
        require!(env::predecessor_account_id() == self.admin, "Only admin");
        self.paused = paused;
        emit("vault_paused", json!({ "paused": paused }));
    }

    // ------------------------------------------------------------------ views

    pub fn get_config(&self) -> ConfigView {
        ConfigView { admin: self.admin.clone(), usdc_contract_id: self.usdc.clone(), paused: self.paused }
    }

    pub fn get_business(&self, business_id: String) -> Option<BusinessView> {
        self.businesses.get(&business_id).map(|b| {
            let spent = if b.spent_day == today() { b.spent_today } else { 0 };
            BusinessView {
                business_id: business_id.clone(),
                owner: b.owner.clone(),
                balance: U128(b.balance),
                agent: b.agent.clone(),
                agent_paused: b.agent_paused,
                max_per_tx: U128(b.max_per_tx),
                daily_limit: U128(b.daily_limit),
                spent_today: U128(spent),
                remaining_today: U128(b.daily_limit.saturating_sub(spent)),
                recipient_count: b.recipient_count,
                storage_balance: U128(b.storage_balance),
                created_at: b.created_at,
            }
        })
    }

    pub fn get_balance(&self, business_id: String) -> U128 {
        U128(self.businesses.get(&business_id).map(|b| b.balance).unwrap_or(0))
    }

    pub fn is_recipient_approved(&self, business_id: String, account_id: AccountId) -> bool {
        self.recipients.contains_key(&recipient_key(&business_id, &account_id))
    }

    pub fn get_payment(&self, business_id: String, payment_id: String) -> Option<PaymentView> {
        self.payments.get(&payment_key(&business_id, &payment_id)).map(|p| PaymentView {
            business_id: p.business_id.clone(),
            payment_id: p.payment_id.clone(),
            kind: p.kind.clone(),
            recipient: p.recipient.clone(),
            amount: U128(p.amount),
            memo: p.memo.clone(),
            status: p.status.clone(),
            created_at: p.created_at,
            signer: p.signer.clone(),
        })
    }

    // ------------------------------------------------------------------ internals

    fn business_mut(&mut self, business_id: &str) -> &mut Business {
        self.businesses.get_mut(business_id).unwrap_or_else(|| env::panic_str("Unknown business"))
    }

    fn owner_business_mut(&mut self, business_id: &str) -> &mut Business {
        near_sdk::assert_one_yocto();
        let caller = env::predecessor_account_id();
        let biz = self.business_mut(business_id);
        require!(biz.owner == caller, "Only the business owner");
        biz
    }

    fn flush(&mut self) {
        self.businesses.flush();
        self.payments.flush();
        self.recipients.flush();
    }

    /// Charges (or refunds) storage growth since `before` against the business's storage balance.
    fn charge_storage(&mut self, business_id: &str, before: u64) {
        self.flush();
        let after = env::storage_usage();
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let biz = self.business_mut(business_id);
        if after > before {
            let cost = (after - before) as u128 * byte_cost;
            require!(biz.storage_balance >= cost, "Insufficient storage balance; call storage_topup");
            biz.storage_balance -= cost;
        } else {
            biz.storage_balance += (before - after) as u128 * byte_cost;
        }
    }

    fn start_transfer(
        &mut self,
        business_id: String,
        payment_id: String,
        kind: PaymentKind,
        recipient: AccountId,
        amount: u128,
        memo: Option<String>,
    ) -> Promise {
        require!(valid_id(&payment_id, 6, 64, true), "Invalid payment_id");
        require!(amount > 0, "Amount must be positive");
        require!(recipient != env::current_account_id() && recipient != self.usdc, "Invalid recipient");
        if let Some(m) = &memo {
            require!(m.len() <= 140, "Memo too long");
        }
        let key = payment_key(&business_id, &payment_id);
        require!(!self.payments.contains_key(&key), "Duplicate payment_id");
        let before = env::storage_usage();
        {
            let biz = self.business_mut(&business_id);
            require!(biz.balance >= amount, "Insufficient business balance");
            biz.balance -= amount;
        }
        self.payments.insert(
            key.clone(),
            Payment {
                business_id: business_id.clone(),
                payment_id: payment_id.clone(),
                kind: kind.clone(),
                recipient: recipient.clone(),
                amount,
                memo: memo.clone(),
                status: PaymentStatus::Pending,
                day: today(),
                created_at: env::block_timestamp(),
                signer: env::predecessor_account_id(),
            },
        );
        self.charge_storage(&business_id, before);
        emit(
            "payment_started",
            json!({ "business_id": business_id, "payment_id": payment_id, "kind": kind, "recipient": recipient, "amount": U128(amount) }),
        );
        ext_ft::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(recipient, U128(amount), memo)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_transfer_complete(key),
            )
    }

    pub(crate) fn resolve_transfer(&mut self, key: &str, success: bool) -> bool {
        let Some(p) = self.payments.get(key).cloned() else {
            env::log_str("Unknown payment key in callback");
            return false;
        };
        if p.status != PaymentStatus::Pending {
            return p.status == PaymentStatus::Completed;
        }
        let new_status = if success { PaymentStatus::Completed } else { PaymentStatus::Failed };
        if !success {
            if let Some(biz) = self.businesses.get_mut(&p.business_id) {
                biz.balance += p.amount;
                if p.kind == PaymentKind::AgentPayment && biz.spent_day == p.day {
                    biz.spent_today = biz.spent_today.saturating_sub(p.amount);
                }
            }
        }
        if let Some(rec) = self.payments.get_mut(key) {
            rec.status = new_status;
        }
        emit(
            if success { "payment_completed" } else { "payment_failed" },
            json!({ "business_id": p.business_id, "payment_id": p.payment_id, "kind": p.kind, "recipient": p.recipient, "amount": U128(p.amount) }),
        );
        success
    }
}

#[cfg(test)]
mod tests;
