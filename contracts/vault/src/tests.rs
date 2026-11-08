use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
const USDC: &str = "usdc.testnet";
const OWNER: &str = "owner.testnet";
const OTHER: &str = "mallory.testnet";
const AGENT: &str = "agent.owner.testnet";
const SUPPLIER: &str = "supplier.testnet";
const BIZ: &str = "acme-co";
const ONE_USDC: u128 = 1_000_000;

fn ctx(predecessor: &str, deposit: u128) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("vault.testnet"))
        .predecessor_account_id(acc(predecessor))
        .signer_account_id(acc(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(10));
    b
}

fn as_(predecessor: &str, deposit: u128) {
    testing_env!(ctx(predecessor, deposit).build());
}

fn setup() -> Vault {
    as_(OWNER, 0);
    let mut v = Vault::new(acc("admin.testnet"), acc(USDC));
    as_(OWNER, NearToken::from_millinear(100).as_yoctonear());
    v.register_business(BIZ.into());
    v
}

fn deposit(v: &mut Vault, biz: &str, amount: u128) -> U128 {
    as_(USDC, 0);
    match v.ft_on_transfer(acc(OWNER), U128(amount), format!("{{\"business_id\":\"{biz}\"}}")) {
        PromiseOrValue::Value(r) => r,
        _ => panic!("expected value"),
    }
}

fn configure_agent(v: &mut Vault, max_per_tx: u128, daily: u128) {
    as_(OWNER, 1);
    v.set_policy(BIZ.into(), U128(max_per_tx), U128(daily));
    v.set_agent(BIZ.into(), acc(AGENT));
    v.add_recipient(BIZ.into(), acc(SUPPLIER));
}

#[test]
fn deposit_credits_only_target_business() {
    let mut v = setup();
    as_(OTHER, NearToken::from_millinear(100).as_yoctonear());
    v.register_business("other-co".into());
    assert_eq!(deposit(&mut v, BIZ, 5 * ONE_USDC).0, 0);
    assert_eq!(v.get_balance(BIZ.into()).0, 5 * ONE_USDC);
    assert_eq!(v.get_balance("other-co".into()).0, 0);
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"deposit\"")));
}

#[test]
#[should_panic(expected = "Only the configured USDC contract can deposit")]
fn fake_deposit_from_other_token_rejected() {
    let mut v = setup();
    as_("fake-usdc.testnet", 0);
    v.ft_on_transfer(acc(OTHER), U128(1_000 * ONE_USDC), format!("{{\"business_id\":\"{BIZ}\"}}"));
}

#[test]
fn deposit_with_bad_msg_or_unknown_business_is_refunded() {
    let mut v = setup();
    as_(USDC, 0);
    let r1 = v.ft_on_transfer(acc(OWNER), U128(7), "not json".into());
    let r2 = v.ft_on_transfer(acc(OWNER), U128(9), "{\"business_id\":\"nope\"}".into());
    assert!(matches!(r1, PromiseOrValue::Value(U128(7))));
    assert!(matches!(r2, PromiseOrValue::Value(U128(9))));
    assert_eq!(v.get_balance(BIZ.into()).0, 0);
}

#[test]
fn agent_pays_approved_recipient_within_limits() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 3 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0001".into(), acc(SUPPLIER), U128(ONE_USDC), Some("sub".into()));
    assert_eq!(v.get_balance(BIZ.into()).0, 9 * ONE_USDC);
    let p = v.get_payment(BIZ.into(), "pay-0001".into()).unwrap();
    assert_eq!(p.status, PaymentStatus::Pending);
    assert!(v.resolve_transfer("acme-co:pay-0001", true));
    assert_eq!(v.get_payment(BIZ.into(), "pay-0001".into()).unwrap().status, PaymentStatus::Completed);
    assert_eq!(v.get_business(BIZ.into()).unwrap().spent_today.0, ONE_USDC);
}

#[test]
#[should_panic(expected = "Amount exceeds per-transaction limit")]
fn agent_over_per_tx_limit_rejected() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0002".into(), acc(SUPPLIER), U128(2 * ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Amount exceeds remaining daily limit")]
fn agent_over_daily_limit_rejected() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, ONE_USDC + ONE_USDC / 2);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0003".into(), acc(SUPPLIER), U128(ONE_USDC), None);
    let _ = v.agent_pay(BIZ.into(), "pay-0004".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Recipient is not approved")]
fn agent_to_unapproved_recipient_rejected() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0005".into(), acc(OTHER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Caller is not this business's agent")]
fn revoked_agent_cannot_pay() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(OWNER, 1);
    v.revoke_agent(BIZ.into());
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0006".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Agent is paused")]
fn paused_agent_cannot_pay() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(OWNER, 1);
    v.set_agent_paused(BIZ.into(), true);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0007".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Insufficient business balance")]
fn payment_above_balance_fails() {
    let mut v = setup();
    deposit(&mut v, BIZ, ONE_USDC / 2);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0008".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Duplicate payment_id")]
fn duplicate_payment_id_rejected() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0009".into(), acc(SUPPLIER), U128(ONE_USDC), None);
    let _ = v.agent_pay(BIZ.into(), "pay-0009".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
fn failed_transfer_restores_balance_and_daily_allowance() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0010".into(), acc(SUPPLIER), U128(ONE_USDC), None);
    assert!(!v.resolve_transfer("acme-co:pay-0010", false));
    assert_eq!(v.get_balance(BIZ.into()).0, 10 * ONE_USDC);
    assert_eq!(v.get_business(BIZ.into()).unwrap().spent_today.0, 0);
    assert_eq!(v.get_payment(BIZ.into(), "pay-0010".into()).unwrap().status, PaymentStatus::Failed);
    // A second resolution must not double-refund.
    v.resolve_transfer("acme-co:pay-0010", false);
    assert_eq!(v.get_balance(BIZ.into()).0, 10 * ONE_USDC);
}

#[test]
#[should_panic(expected = "Only the business owner")]
fn other_account_cannot_withdraw() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    as_(OTHER, 1);
    let _ = v.withdraw(BIZ.into(), "wd-0001".into(), U128(ONE_USDC), Some(acc(OTHER)));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn agent_key_without_deposit_cannot_call_owner_methods() {
    let mut v = setup();
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 0);
    v.set_policy(BIZ.into(), U128(1_000 * ONE_USDC), U128(1_000 * ONE_USDC));
}

#[test]
#[should_panic(expected = "Only the business owner")]
fn agent_cannot_change_policy_even_with_deposit() {
    let mut v = setup();
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(AGENT, 1);
    v.set_policy(BIZ.into(), U128(1_000 * ONE_USDC), U128(1_000 * ONE_USDC));
}

#[test]
fn owner_can_pay_any_recipient_above_agent_limit() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 2 * ONE_USDC);
    as_(OWNER, 1);
    let _ = v.owner_pay(BIZ.into(), "own-0001".into(), acc(OTHER), U128(5 * ONE_USDC), None);
    assert_eq!(v.get_balance(BIZ.into()).0, 5 * ONE_USDC);
    // Owner payments do not consume the agent's daily allowance.
    assert_eq!(v.get_business(BIZ.into()).unwrap().spent_today.0, 0);
}

#[test]
fn withdraw_allowed_while_globally_paused() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    as_("admin.testnet", 1);
    v.set_paused(true);
    as_(OWNER, 1);
    let _ = v.withdraw(BIZ.into(), "wd-0002".into(), U128(10 * ONE_USDC), None);
    assert_eq!(v.get_balance(BIZ.into()).0, 0);
}

#[test]
#[should_panic(expected = "Vault is paused")]
fn agent_blocked_while_globally_paused() {
    let mut v = setup();
    deposit(&mut v, BIZ, 10 * ONE_USDC);
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_("admin.testnet", 1);
    v.set_paused(true);
    as_(AGENT, 0);
    let _ = v.agent_pay(BIZ.into(), "pay-0011".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
#[should_panic(expected = "Caller is not this business's agent")]
fn agent_of_one_business_cannot_spend_another() {
    let mut v = setup();
    configure_agent(&mut v, ONE_USDC, 5 * ONE_USDC);
    as_(OTHER, NearToken::from_millinear(100).as_yoctonear());
    v.register_business("other-co".into());
    deposit(&mut v, "other-co", 10 * ONE_USDC);
    as_(AGENT, 0);
    let _ = v.agent_pay("other-co".into(), "pay-0012".into(), acc(SUPPLIER), U128(ONE_USDC), None);
}

#[test]
fn storage_is_charged_to_business() {
    let v = setup();
    let b = v.get_business(BIZ.into()).unwrap();
    assert!(b.storage_balance.0 < NearToken::from_millinear(100).as_yoctonear());
    assert!(b.storage_balance.0 > 0);
}
