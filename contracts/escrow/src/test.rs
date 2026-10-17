#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
extern crate std;
use super::*;
use soroban_sdk::{testutils::Events as _, vec, Env, Event, IntoVal};

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, advance_time, reentry, HostileTokenHandle, TestToken};

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

// ---------------------------------------------------------------------------
// Issue #79: behaviour with a hostile token contract
// ---------------------------------------------------------------------------
//
// Every escrow state transition performs its `token::Client::transfer` first
// and only then persists the new status. A token that calls back into the
// escrow mid-transfer therefore observes the pre-write state — and a token
// that moves less than requested is trusted blindly. These tests pin today's
// behaviour. See SECURITY.md ("Known Limitations").

/// A re-entrant `fund_escrow` (double-charge attempt) armed on the token is
/// refused by the host because it targets the same contract instance: the
/// whole funding call traps and rolls back. The escrow stays `Created`, the
/// payer keeps its balance, and funding works normally once the token's
/// one-shot re-entry flag is disarmed.
#[test]
fn test_hostile_token_reentry_on_fund_is_blocked_by_the_host() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.client.mint(&payer, &1000);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);

    // The funding transfer re-enters `fund_escrow` on this very contract.
    token.client.arm_reentry(&reentry(
        &env,
        &client.address,
        "fund_escrow",
        vec![&env, 1u64.into_val(&env)],
    ));
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| client.fund_escrow(&1)));
    let _ = std::panic::take_hook();
    assert!(outcome.is_err(), "same-contract re-entry must abort the invocation");

    // Fully rolled back: still unfunded, payer whole, contract empty.
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Created);
    assert_eq!(token.balance(&payer), 1000);
    assert_eq!(token.balance(&client.address), 0);

    // The host's re-entry rule is what saves the ordering here, not the
    // status check: at the moment of the callback the outer call has not yet
    // written `Funded`, so a host that permitted the re-entry would have let
    // the payer be charged twice for a single 500-unit escrow.
    token.client.disarm_reentry();
    client.fund_escrow(&1);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Funded);
    assert_eq!(token.balance(&client.address), 500);
    assert_eq!(token.balance(&payer), 500);
}

/// `fund_escrow` trusts the inbound transfer: with 200 silently skimmed, the
/// escrow is marked `Funded` for 500 while the contract only holds 300. The
/// books overstate custody from that point on, and the payee absorbs the
/// difference when the escrow is released.
#[test]
fn test_hostile_token_short_transfer_on_fund_overstates_escrow() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.client.mint(&payer, &500);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    token.client.set_shortfall(&200);
    client.fund_escrow(&1);

    // Only 300 arrived, yet the escrow records a fully funded 500-unit deal.
    assert_eq!(token.balance(&client.address), 300);
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Funded);
    assert_eq!(escrow.amount, 500);

    // Release (with the skimming disarmed) "succeeds" and marks the escrow
    // Released, but pays the payee only the 300 actually in custody.
    token.client.clear_shortfall();
    client.release_escrow(&1, &arbiter);
    assert_eq!(token.balance(&payee), 300);
    assert_eq!(client.get_escrow(&1).unwrap().status, EscrowStatus::Released);
}

/// A shortfall armed on the way out under-pays the counterparty while the
/// state transition is persisted as if the full amount had moved: the 100
/// that never arrived is stranded in the contract with no mechanism to
/// recover it, and `refund` behaves identically (the payer is short-changed
/// and the escrow is marked `Refunded`).
#[test]
fn test_hostile_token_short_transfer_on_release_underpays_payee() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let payer = account(&env);
    let payee = account(&env);
    let arbiter = account(&env);
    token.client.mint(&payer, &500);
    let client = register(&env);

    client.create_escrow(&1, &payer, &payee, &arbiter, &token.id, &500, &1000);
    client.fund_escrow(&1);

    // Skim 100 from the release transfer only.
    token.client.set_shortfall(&100);
    client.release_escrow(&1, &payer);

    assert_eq!(token.balance(&payee), 400); // 500 promised, 400 delivered
    let escrow = client.get_escrow(&1).unwrap();
    assert_eq!(escrow.status, EscrowStatus::Released);
    // The skimmed 100 is left behind in the contract, unrecoverable. The
    // refund path behaves identically in reverse: a skimmed `refund_escrow`
    // under-pays the payer while the escrow flips to `Refunded`.
    assert_eq!(token.balance(&client.address), 100);
}
