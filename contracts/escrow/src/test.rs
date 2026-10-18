#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
use super::*;
use soroban_sdk::{testutils::Events as _, vec, Env, Event, IntoVal};

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, advance_time, reentry_rejected, HostileToken, TestToken};

fn register(env: &Env) -> EscrowContractClient<'_> {
    EscrowContractClient::new(env, &env.register(EscrowContract, ()))
}

#[test]
fn test_escrow_lifecycle_release_by_payer() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    // Create
    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Created);

    // Fund
    client.fund_escrow(&1);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(token.balance(&payer), 500);
    assert_eq!(token.balance(&client.address), 500);

    // Release by payer
    client.release_escrow(&1, &payer);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
    assert_eq!(token.balance(&payee), 500);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_escrow_lifecycle_release_by_arbiter() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Release by arbiter
    client.release_escrow(&1, &arbiter);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
    assert_eq!(token.balance(&payee), 500);
}

#[test]
fn test_escrow_lifecycle_refund_by_payee() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Refund by payee
    client.refund_escrow(&1, &payee);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Refunded);
    assert_eq!(token.balance(&payer), 1000);
}

#[test]
fn test_escrow_lifecycle_refund_by_arbiter() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Refund by arbiter
    client.refund_escrow(&1, &arbiter);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Refunded);
    assert_eq!(token.balance(&payer), 1000);
}

#[test]
fn test_escrow_cancel_before_funding() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);

    // Cancel by payer when Created (unfunded)
    client.cancel_escrow(&1, &payer);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Cancelled);
}

#[test]
fn test_escrow_cancel_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Move the ledger past the deadline
    advance_time(&env, 1001);

    // Cancel by payer should work now
    client.cancel_escrow(&1, &payer);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Cancelled);
    assert_eq!(token.balance(&payer), 1000);
}

#[test]
fn test_escrow_cancel_before_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Still before the deadline
    advance_time(&env, 500);

    // Cancel by payer should fail
    let result = client.try_cancel_escrow(&1, &payer);
    assert_eq!(result, Err(Ok(EscrowError::DeadlineNotReached)));
}

#[test]
fn test_escrow_invalid_state_transitions() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);

    // Try to release unfunded escrow -> should fail
    let res = client.try_release_escrow(&1, &payer);
    assert_eq!(res, Err(Ok(EscrowError::InvalidStateTransition)));

    // Fund it
    client.fund_escrow(&1);

    // Try to fund again -> should fail
    let res2 = client.try_fund_escrow(&1);
    assert_eq!(res2, Err(Ok(EscrowError::InvalidStateTransition)));

    // Release it
    client.release_escrow(&1, &payer);

    // Try to refund already released escrow -> should fail
    let res3 = client.try_refund_escrow(&1, &arbiter);
    assert_eq!(res3, Err(Ok(EscrowError::AlreadyFinalized)));
}

#[test]
fn test_escrow_unauthorized_operations() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Unauthorized release (payee calls it) -> should fail
    let res = client.try_release_escrow(&1, &payee);
    assert_eq!(res, Err(Ok(EscrowError::UnauthorizedOperation)));

    // Unauthorized refund (payer calls it) -> should fail
    let res2 = client.try_refund_escrow(&1, &payer);
    assert_eq!(res2, Err(Ok(EscrowError::UnauthorizedOperation)));

    // Unauthorized cancel (arbiter calls it) -> should fail
    let res3 = client.try_cancel_escrow(&1, &arbiter);
    assert_eq!(res3, Err(Ok(EscrowError::UnauthorizedOperation)));
}

#[test]
fn test_escrow_validation_failures() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    let client = register(&env);

    // Invalid amount
    let res = client.try_create_escrow(&1, &payer, &payee, &arbiter, &token.id, &0, &1000);
    assert_eq!(res, Err(Ok(EscrowError::InvalidAmount)));

    // Successful creation
    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);

    // Duplicate ID creation
    let res2 = client.try_create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    assert_eq!(res2, Err(Ok(EscrowError::EscrowAlreadyExists)));
}

#[test]
fn test_escrow_events() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    // In v27 `env.events().all()` holds only the most recent invocation's
    // events, so each emission is asserted right after the call that produced
    // it. Filtering by the escrow contract drops the token contract's own
    // transfer events.

    // Create
    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [EscrowCreated { id: 1, payer: payer.clone(), amount: 500 }.to_xdr(&env, &client.address)],
    );

    // Fund
    client.fund_escrow(&1);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [EscrowFunded { id: 1, amount: 500 }.to_xdr(&env, &client.address)],
    );

    // Release
    client.release_escrow(&1, &payer);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [EscrowReleased { id: 1, caller: payer.clone(), payee: payee.clone(), amount: 500 }
            .to_xdr(&env, &client.address)],
    );

    // Refund
    client.create_escrow(&2, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&2);
    client.refund_escrow(&2, &payee);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [EscrowRefunded { id: 2, caller: payee.clone(), payer: payer.clone(), amount: 500 }
            .to_xdr(&env, &client.address)],
    );

    // Cancel (unfunded)
    client.create_escrow(&3, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.cancel_escrow(&3, &payer);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [EscrowCancelled { id: 3, payer: payer.clone() }.to_xdr(&env, &client.address)],
    );
}

/// Escrow #1 for 500 [`HostileToken`]s with a deadline of 1000, created but
/// not yet funded. The payer holds 1000.
///
/// Non-root auth is allowed so a reentrant call would clear `require_auth`:
/// the host's reentry check is the only thing left standing in its way.
fn hostile_escrow(
    env: &Env,
) -> (HostileToken<'_>, Address, Address, Address, EscrowContractClient<'_>) {
    env.mock_all_auths_allowing_non_root_auth();
    let token = HostileToken::deploy(env);
    let payer = account(env);
    let payee = account(env);
    let arbiter = account(env);
    token.mint(&payer, 1000);
    let client = register(env);
    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    (token, payer, payee, arbiter, client)
}

#[test]
fn test_fund_rejects_reentrant_fund() {
    let env = Env::default();
    let (token, payer, _, _, client) = hostile_escrow(&env);

    token.arm(&client.address, "fund_escrow", vec![&env, 1u64.into_val(&env)], true);
    client.fund_escrow(&1);

    // The payer is charged once, not twice.
    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payer), 500);
    assert_eq!(token.balance(&client.address), 500);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Funded);
}

#[test]
fn test_release_rejects_reentrant_refund() {
    let env = Env::default();
    let (token, payer, payee, arbiter, client) = hostile_escrow(&env);
    client.fund_escrow(&1);

    // Paying the payee and refunding the payer from the same 500 would be the
    // double spend.
    let args = vec![&env, 1u64.into_val(&env), arbiter.into_val(&env)];
    token.arm(&client.address, "refund_escrow", args, true);
    client.release_escrow(&1, &payer);

    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payee), 500);
    assert_eq!(token.balance(&payer), 500);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Released);
}

#[test]
fn test_release_rejects_reentrant_release() {
    let env = Env::default();
    let (token, payer, payee, arbiter, client) = hostile_escrow(&env);
    client.fund_escrow(&1);

    let args = vec![&env, 1u64.into_val(&env), arbiter.into_val(&env)];
    token.arm(&client.address, "release_escrow", args, true);
    client.release_escrow(&1, &payer);

    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payee), 500);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_refund_rejects_reentrant_release() {
    let env = Env::default();
    let (token, payer, payee, _, client) = hostile_escrow(&env);
    client.fund_escrow(&1);

    let args = vec![&env, 1u64.into_val(&env), payer.into_val(&env)];
    token.arm(&client.address, "release_escrow", args, true);
    client.refund_escrow(&1, &payee);

    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payer), 1000);
    assert_eq!(token.balance(&payee), 0);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Refunded);
}

#[test]
fn test_cancel_rejects_reentrant_release() {
    let env = Env::default();
    let (token, payer, payee, arbiter, client) = hostile_escrow(&env);
    client.fund_escrow(&1);
    advance_time(&env, 1000);

    let args = vec![&env, 1u64.into_val(&env), arbiter.into_val(&env)];
    token.arm(&client.address, "release_escrow", args, true);
    client.cancel_escrow(&1, &payer);

    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payer), 1000);
    assert_eq!(token.balance(&payee), 0);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Cancelled);
}

#[test]
fn test_propagated_reentry_rolls_back_the_whole_release() {
    let env = Env::default();
    let (token, payer, payee, arbiter, client) = hostile_escrow(&env);
    client.fund_escrow(&1);

    let args = vec![&env, 1u64.into_val(&env), arbiter.into_val(&env)];
    token.arm(&client.address, "refund_escrow", args, false);
    assert!(client.try_release_escrow(&1, &payer).is_err());

    // The early `Released` write was rolled back along with the transfer.
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Funded);
    assert_eq!(token.balance(&payer), 500);
    assert_eq!(token.balance(&payee), 0);
    assert_eq!(token.balance(&client.address), 500);
    assert_eq!(token.last_reentry(), None);
}
