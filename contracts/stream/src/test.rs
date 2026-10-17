#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
extern crate std;
use super::*;
use soroban_sdk::{testutils::Events as _, vec, Env, Event, IntoVal, String};
use std::println;

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, advance_time, empty_string, reentry, HostileTokenHandle, TestToken};

fn register(env: &Env) -> StreamContractClient<'_> {
    StreamContractClient::new(env, &env.register(StreamContract, ()))
}

/// A deployed (unfunded) token, a sender, a recipient and a registered client.
fn setup(env: &Env) -> (TestToken<'_>, Address, Address, StreamContractClient<'_>) {
    let token = TestToken::deploy(env);
    let sender = account(env);
    let recipient = account(env);
    (token, sender, recipient, register(env))
}

/// Creates a stream with no metadata attached.
fn create(
    env: &Env,
    client: &StreamContractClient,
    sender: &Address,
    recipient: &Address,
    token: &Address,
    amount: i128,
    start: u64,
    end: u64,
    cliff: u64,
) -> u64 {
    let metadata = empty_string(env);
    client.create_stream(
        sender, recipient, token, &amount, &start, &end, &cliff, &metadata, &metadata,
    )
}

#[test]
fn test_linear_vesting_and_withdraw() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    assert_eq!(id, 1);
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(token.balance(&client.address), 1000);

    // Nothing has vested at t=0.
    assert_eq!(client.claimable(&id), 0);
    assert!(client.try_withdraw(&id).is_err());

    // Halfway through, exactly half is claimable.
    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 500);
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 500);
    assert_eq!(token.balance(&client.address), 500);

    // A second withdraw at the same instant yields nothing.
    assert!(client.try_withdraw(&id).is_err());

    // At the end, the remainder is withdrawable.
    advance_time(&env, 500);
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_cliff_blocks_early_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 400);

    advance_time(&env, 399);
    assert_eq!(client.claimable(&id), 0);
    assert!(client.try_withdraw(&id).is_err());

    advance_time(&env, 1);
    assert_eq!(client.claimable(&id), 400);
    assert_eq!(client.withdraw(&id), 400);
}

#[test]
fn test_full_vest_after_end() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 100, 1100, 100);
    advance_time(&env, 5000);
    assert_eq!(client.vested(&id), 1000);
    assert_eq!(client.claimable(&id), 1000);
}

#[test]
fn test_cancel_refunds_unvested_and_keeps_vested() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    advance_time(&env, 300);
    client.cancel(&id);

    // Sender is refunded the unvested 700.
    assert_eq!(token.balance(&sender), 700);
    // The vested 300 remains claimable by the recipient.
    assert_eq!(client.claimable(&id), 300);
    assert_eq!(client.withdraw(&id), 300);
    assert_eq!(token.balance(&recipient), 300);
    assert_eq!(token.balance(&client.address), 0);

    let stream = client.get_stream(&id).unwrap();
    assert!(stream.cancelled);
}

#[test]
fn test_cancel_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    advance_time(&env, 300);
    client.cancel(&id);
    let res = client.try_cancel(&id);
    assert_eq!(res, Err(Ok(StreamError::AlreadyCancelled)));
}

#[test]
fn test_cancel_before_start_refunds_everything() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 500, 1500, 500);
    advance_time(&env, 100);
    client.cancel(&id);

    assert_eq!(token.balance(&sender), 1000);
    assert_eq!(client.claimable(&id), 0);
}

#[test]
fn test_invalid_parameters() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    let no_metadata = empty_string(&env);

    // Zero amount.
    assert_eq!(
        client.try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &0,
            &0,
            &1000,
            &0,
            &no_metadata,
            &no_metadata
        ),
        Err(Ok(StreamError::InvalidAmount)),
    );
    // End before start.
    assert_eq!(
        client.try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &1000,
            &1000,
            &1000,
            &1000,
            &no_metadata,
            &no_metadata
        ),
        Err(Ok(StreamError::InvalidTimeRange)),
    );
    // Cliff outside the schedule.
    assert_eq!(
        client.try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &1000,
            &0,
            &1000,
            &2000,
            &no_metadata,
            &no_metadata
        ),
        Err(Ok(StreamError::InvalidCliff)),
    );
}

#[test]
fn test_stream_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    assert!(client.get_stream(&99).is_none());
    assert_eq!(client.try_claimable(&99), Err(Ok(StreamError::StreamNotFound)));
}

#[test]
fn test_protocol_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let admin = account(&env);
    let treasury = account(&env);
    client.initialize(&admin, &treasury, &100); // 1%

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    advance_time(&env, 1000);

    // 1% of 1000 = 10 to treasury, 990 to recipient.
    assert_eq!(client.withdraw(&id), 990);
    assert_eq!(token.balance(&recipient), 990);
    assert_eq!(token.balance(&treasury), 10);
}

#[test]
fn test_initialize_twice_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let admin = account(&env);
    let treasury = account(&env);
    client.initialize(&admin, &treasury, &0);
    let res = client.try_initialize(&admin, &treasury, &0);
    assert_eq!(res, Err(Ok(StreamError::AlreadyInitialized)));
}

#[test]
fn test_invalid_fee_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let admin = account(&env);
    let treasury = account(&env);
    let res = client.try_initialize(&admin, &treasury, &5000);
    assert_eq!(res, Err(Ok(StreamError::InvalidFee)));
}

#[test]
fn test_auth_is_required_to_create() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let no_metadata = empty_string(&env);

    // Drop all mocked auths: the call must now fail on `require_auth`.
    env.mock_auths(&[]);
    assert!(client
        .try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &1000,
            &0,
            &1000,
            &0,
            &no_metadata,
            &no_metadata
        )
        .is_err());
}

#[test]
fn test_ids_increment() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 2000);

    let a = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    let b = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    assert_eq!(a, 1);
    assert_eq!(b, 2);
    assert_eq!(client.next_stream_id(), 3);
}

#[test]
fn test_create_with_metadata() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let label = String::from_str(&env, "Q4 payroll");
    let reference = String::from_str(&env, "INV-2026-0042");
    let id = client
        .create_stream(&sender, &recipient, &token.id, &1000, &0, &1000, &0, &label, &reference);

    // Both fields are carried on the `created` event... (checked first: the
    // event log only holds the most recent invocation's events)
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [StreamCreated {
            id,
            sender,
            recipient,
            amount: 1000,
            label: label.clone(),
            reference: reference.clone(),
        }
        .to_xdr(&env, &client.address)],
    );

    // ...and are readable back through `get_stream`.
    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.label, label);
    assert_eq!(stream.reference, reference);
    assert_eq!(stream.total_amount, 1000);
}

#[test]
fn test_create_without_metadata_keeps_behaviour() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    let no_metadata = empty_string(&env);

    // The event announces the empty metadata as such (checked first: the event
    // log only holds the most recent invocation's events).
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [StreamCreated {
            id,
            sender,
            recipient: recipient.clone(),
            amount: 1000,
            label: no_metadata.clone(),
            reference: no_metadata.clone(),
        }
        .to_xdr(&env, &client.address)],
    );

    // Metadata is stored as empty strings.
    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.label, no_metadata);
    assert_eq!(stream.reference, no_metadata);

    // Vesting and balances are untouched by the empty metadata.
    advance_time(&env, 1000);
    assert_eq!(client.withdraw(&id), 1000);
    assert_eq!(token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_metadata_length_limits() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 2000);

    let label_at_limit = String::from_bytes(&env, &[b'l'; MAX_LABEL_LEN as usize]);
    let reference_at_limit = String::from_bytes(&env, &[b'r'; MAX_REFERENCE_LEN as usize]);
    let id = client.create_stream(
        &sender,
        &recipient,
        &token.id,
        &1000,
        &0,
        &1000,
        &0,
        &label_at_limit,
        &reference_at_limit,
    );
    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.label.len(), MAX_LABEL_LEN);
    assert_eq!(stream.reference.len(), MAX_REFERENCE_LEN);

    let label_too_long = String::from_bytes(&env, &[b'l'; MAX_LABEL_LEN as usize + 1]);
    let reference_too_long = String::from_bytes(&env, &[b'r'; MAX_REFERENCE_LEN as usize + 1]);
    assert_eq!(
        client.try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &1000,
            &0,
            &1000,
            &0,
            &label_too_long,
            &reference_at_limit,
        ),
        Err(Ok(StreamError::MetadataTooLong)),
    );
    assert_eq!(
        client.try_create_stream(
            &sender,
            &recipient,
            &token.id,
            &1000,
            &0,
            &1000,
            &0,
            &label_at_limit,
            &reference_too_long,
        ),
        Err(Ok(StreamError::MetadataTooLong)),
    );

    // The rejections happened before any transfer.
    assert_eq!(token.balance(&sender), 1000);
}

// ---------------------------------------------------------------------------
// Issue #78: cancel at schedule boundaries
// ---------------------------------------------------------------------------

/// Cancelling at exactly `start_time` must refund the full locked amount:
/// `vested_amount` is 0 at `now == start_time` (elapsed == 0), so `cancel`
/// refunds `total - 0` and the recipient is left with nothing to claim.
#[test]
fn test_cancel_at_exactly_start_time_refunds_full_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    // Schedule starts at t=500; the ledger clock starts at 0.
    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 500, 1500, 500);
    assert_eq!(token.balance(&client.address), 1000);

    // Move to exactly start_time, then cancel.
    advance_time(&env, 500);
    assert_eq!(env.ledger().timestamp(), 500);
    client.cancel(&id);

    // Full refund to the sender, contract fully drained.
    assert_eq!(token.balance(&sender), 1000);
    assert_eq!(token.balance(&client.address), 0);
    // Nothing is claimable, and an empty withdraw is rejected.
    assert_eq!(client.claimable(&id), 0);
    assert_eq!(client.vested(&id), 0);
    assert_eq!(client.try_withdraw(&id), Err(Ok(StreamError::NothingToWithdraw)));

    let stream = client.get_stream(&id).unwrap();
    assert!(stream.cancelled);
    assert_eq!(stream.total_amount, 0);
}

/// Cancelling at exactly `end_time` must refund nothing: `vested_amount`
/// returns the full amount once `now >= end_time`, so the entire stream stays
/// with the recipient, who can withdraw all of it afterwards.
#[test]
fn test_cancel_at_exactly_end_time_refunds_nothing() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    // Move to exactly end_time, then cancel.
    advance_time(&env, 1000);
    assert_eq!(env.ledger().timestamp(), 1000);
    client.cancel(&id);

    // No refund: the sender holds nothing back.
    assert_eq!(token.balance(&sender), 0);
    // Everything is vested and claimable by the recipient.
    assert_eq!(client.vested(&id), 1000);
    assert_eq!(client.claimable(&id), 1000);

    // The recipient can withdraw the full amount afterwards.
    assert_eq!(client.withdraw(&id), 1000);
    assert_eq!(token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);

    let stream = client.get_stream(&id).unwrap();
    assert!(stream.cancelled);
    assert_eq!(stream.total_amount, 1000);
}

/// Cancelling at a midpoint must refund exactly `total - vested` with no
/// rounding drift: the refund plus the recipient's later withdrawal adds up to
/// the original locked amount, and the contract is left with no residue.
#[test]
fn test_cancel_at_midpoint_refunds_total_minus_vested_exactly() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    advance_time(&env, 450);
    let vested_before = client.vested(&id);
    assert_eq!(vested_before, 450);

    client.cancel(&id);

    // Refund is exactly total - vested.
    assert_eq!(token.balance(&sender), 1000 - vested_before);
    assert_eq!(token.balance(&client.address), vested_before);
    // The compressed schedule keeps the vested amount claimable.
    assert_eq!(client.claimable(&id), vested_before);

    // Withdraw the remainder; the sum of both payouts equals the total
    // exactly, and the contract ends at zero (no dust, no drift).
    let paid_out = client.withdraw(&id);
    assert_eq!(paid_out, vested_before);
    assert_eq!(token.balance(&recipient), vested_before);
    assert_eq!(token.balance(&sender) + token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);
}

/// Same midpoint invariant on a schedule whose linear division truncates:
/// the refund still equals `total - vested` exactly, and refund + withdrawal
/// still sums back to the locked total with no residue in the contract.
#[test]
fn test_cancel_at_midpoint_truncated_division_no_drift() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    // 1000 over 3 ledgers: at t=1 vested is 333 (1000/3 truncated), so the
    // refund must be 667, not 666 or 668.
    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 3, 0);
    advance_time(&env, 1);
    assert_eq!(client.vested(&id), 333);

    client.cancel(&id);

    assert_eq!(token.balance(&sender), 667);
    assert_eq!(client.claimable(&id), 333);
    assert_eq!(client.withdraw(&id), 333);
    assert_eq!(token.balance(&recipient), 333);
    assert_eq!(token.balance(&sender) + token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);
}

// ---------------------------------------------------------------------------
// Issue #79: behaviour with a hostile token contract
// ---------------------------------------------------------------------------
//
// The stream contract performs `token::Client::transfer` and only afterwards
// persists the resulting state (withdrawn / cancelled / schedule compression).
// A non-standard token could in principle try to call back into the stream
// contract while that transfer is in flight ("re-entry"), or move less than
// the requested amount while reporting success ("short transfer"). These tests
// pin today's behaviour for both attacks; see SECURITY.md ("Known
// Limitations").

/// Re-entrancy during `withdraw`: the armed token tries to call `withdraw`
/// again while the first invocation is inside `transfer`, before `withdrawn`
/// has been persisted. Soroban forbids re-entering the *same* contract within
/// one top-level invocation, so the inner call traps with "Contract re-entry
/// is not allowed" and the entire `withdraw` panics. The host's re-entry rule
/// is what protects the contract's write-after-transfer ordering, not the
/// contract itself.
#[test]
fn test_hostile_token_reentry_on_withdraw_is_blocked_by_the_host() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let sender = account(&env);
    let recipient = account(&env);
    let client = register(&env);
    token.client.mint(&sender, &1000);

    let metadata = empty_string(&env);
    let id = client
        .create_stream(&sender, &recipient, &token.id, &1000, &0, &1000, &0, &metadata, &metadata);
    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 500);

    // The next token transfer tries to re-enter `withdraw` on this very
    // contract. Silence the expected panic message, catch the trap, and then
    // inspect the state the failed call left behind.
    token.client.arm_reentry(&reentry(
        &env,
        &client.address,
        "withdraw",
        vec![&env, id.into_val(&env)],
    ));
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| client.withdraw(&id)));
    let _ = std::panic::take_hook();

    // Today's outcome: the re-entrant call is refused by the host, and with it
    // the whole withdrawal — `withdraw` never returns a payout.
    assert!(outcome.is_err(), "same-contract re-entry must abort the invocation");

    // The failed top-level invocation is rolled back in full: the recipient
    // was never paid, the stream's books are untouched, and the contract
    // still custodies the entire deposit.
    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.withdrawn, 0);
    assert_eq!(token.balance(&recipient), 0);
    assert_eq!(token.balance(&client.address), 1000);
    assert_eq!(client.claimable(&id), 500);

    // The rollback also restored the token's one-shot flag: while the armed
    // re-entry persists, every further payout attempt panics the same way —
    // the attack is a denial-of-service on the withdrawal path, not a way to
    // corrupt the books.
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| client.withdraw(&id)));
    let _ = std::panic::take_hook();
    assert!(second.is_err(), "the rolled-back re-entry flag still poisons transfers");

    // Once the token's re-entry flag is disarmed, withdrawal works normally
    // and pays exactly the vested amount: accounting was never corrupted.
    token.client.disarm_reentry();
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 500);
    assert_eq!(client.get_stream(&id).unwrap().withdrawn, 500);
}

/// Re-entrancy during `cancel`: the armed token tries to re-enter `cancel`
/// while the refund transfer is in flight, hoping to double-refund the sender
/// before `cancelled = true` is persisted. Same as for `withdraw`: the host
/// refuses same-contract re-entry and the call panics.
#[test]
fn test_hostile_token_reentry_on_cancel_is_blocked_by_the_host() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let sender = account(&env);
    let recipient = account(&env);
    let client = register(&env);
    token.client.mint(&sender, &1000);

    let metadata = empty_string(&env);
    let id = client
        .create_stream(&sender, &recipient, &token.id, &1000, &0, &1000, &0, &metadata, &metadata);
    advance_time(&env, 300);
    assert_eq!(client.vested(&id), 300);

    token.client.arm_reentry(&reentry(
        &env,
        &client.address,
        "cancel",
        vec![&env, id.into_val(&env)],
    ));
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| client.cancel(&id)));
    let _ = std::panic::take_hook();
    assert!(outcome.is_err(), "same-contract re-entry must abort the invocation");

    // Today's outcome: the host refuses the re-entrant `cancel`, the refund
    // transfer never completes, and the whole invocation is rolled back. The
    // sender keeps nothing, the stream stays live and un-cancelled.
    let stream = client.get_stream(&id).unwrap();
    assert!(!stream.cancelled);
    assert_eq!(stream.total_amount, 1000);
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(token.balance(&client.address), 1000);
}

/// Short transfer on the way in: `create_stream` trusts the token to have
/// moved the full amount. When the armed token skims 200, the contract holds
/// 800 but the schedule is configured for 1000 — every on-chain number
/// (total_amount, vested, claimable) overstates the real balance, and the
/// final 200 of vesting becomes unpayable.
#[test]
fn test_hostile_token_short_transfer_on_create_overstates_stream() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let sender = account(&env);
    let recipient = account(&env);
    let client = register(&env);
    token.client.mint(&sender, &1000);

    // Skim 200 from the deposit, then disarm: later transfers move normally.
    token.client.set_shortfall(&200);
    let metadata = empty_string(&env);
    let id = client
        .create_stream(&sender, &recipient, &token.id, &1000, &0, &1000, &0, &metadata, &metadata);
    token.client.clear_shortfall();

    // The contract recorded a 1000 deposit but only holds 800.
    assert_eq!(token.balance(&client.address), 800);
    assert_eq!(client.get_stream(&id).unwrap().total_amount, 1000);

    // The recipient can claim up to the phantom total; the last claim only
    // "succeeds" on paper, delivering what the contract actually holds.
    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 500);
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 500);
    assert_eq!(token.balance(&client.address), 300);

    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 500);
    // Only 300 is left in the contract; the token delivers 300 but reports
    // success, and the books mark 500 withdrawn.
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 800);
    assert_eq!(client.get_stream(&id).unwrap().withdrawn, 1000);
    assert_eq!(token.balance(&client.address), 0);
}

/// Short transfer on the way out: `withdraw` marks `claimable` as withdrawn
/// regardless of what the token actually delivered. With 100 skimmed, the
/// recipient is under-paid by 100 while the stream shows the claim as fully
/// settled — the shortfall is silently lost.
#[test]
fn test_hostile_token_short_transfer_on_withdraw_underpays_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let sender = account(&env);
    let recipient = account(&env);
    let client = register(&env);
    token.client.mint(&sender, &1000);

    let metadata = empty_string(&env);
    let id = client
        .create_stream(&sender, &recipient, &token.id, &1000, &0, &1000, &0, &metadata, &metadata);
    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 500);

    token.client.set_shortfall(&100);
    let net = client.withdraw(&id);

    // The API promises 500, the recipient receives 400, and the claim is
    // closed: `withdrawn` moved by the full 500.
    assert_eq!(net, 500);
    assert_eq!(token.balance(&recipient), 400);
    assert_eq!(client.get_stream(&id).unwrap().withdrawn, 500);
    assert_eq!(client.claimable(&id), 0);

    // Cancel refunds are skimmed the same way: `cancelled` and the compressed
    // schedule are persisted even though the sender received less than the
    // unvested amount.
    advance_time(&env, 200); // vested = 700, unvested = 300
    token.client.set_shortfall(&50);
    client.cancel(&id);
    assert_eq!(token.balance(&sender), 250); // 300 owed, 250 delivered
    let stream = client.get_stream(&id).unwrap();
    assert!(stream.cancelled);
    assert_eq!(stream.total_amount, 700);
}

// ---------------------------------------------------------------------------
// Issue #81: milestone (non-linear) vesting
// ---------------------------------------------------------------------------

/// Helper: create a milestone stream of `amounts` with no arbiter.
fn create_ms(
    env: &Env,
    client: &StreamContractClient,
    sender: &Address,
    recipient: &Address,
    token: &Address,
    amounts: Vec<i128>,
) -> u64 {
    let metadata = empty_string(env);
    client.create_milestones(sender, recipient, token, &amounts, &None, &metadata, &metadata)
}

/// Full release: tranches vest only when released, in order; after the last
/// release the recipient can withdraw exactly the total and the contract is
/// drained to zero.
#[test]
fn test_milestone_full_release() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 100, 200, 700]);
    assert_eq!(token.balance(&client.address), 1000);

    // Nothing is claimable before any release, no matter how much time passes.
    advance_time(&env, 100_000);
    assert_eq!(client.claimable(&id), 0);
    assert_eq!(client.vested(&id), 0);
    assert_eq!(client.try_withdraw(&id), Err(Ok(StreamError::NothingToWithdraw)));

    // Release tranche 0: 100 instantly vests and is withdrawable.
    client.release_milestones(&id, &0, &sender);
    assert_eq!(client.vested(&id), 100);
    assert_eq!(client.claimable(&id), 100);
    assert_eq!(client.withdraw(&id), 100);
    assert_eq!(token.balance(&recipient), 100);

    // Release tranches 1 and 2; the remainder becomes claimable.
    client.release_milestones(&id, &1, &sender);
    client.release_milestones(&id, &2, &sender);
    assert_eq!(client.claimable(&id), 900);
    assert_eq!(client.withdraw(&id), 900);
    assert_eq!(token.balance(&recipient), 1000);
    assert_eq!(token.balance(&client.address), 0);

    let ms = client.get_milestones(&id).unwrap();
    assert_eq!(ms.tranches.len(), 3);
    assert!(ms.tranches.iter().all(|t| t.released));
    assert!(!client.get_stream(&id).unwrap().cancelled);
}

/// The optional arbiter may release; the recipient may not. With `arbiter`
/// set to `None`, only the sender can release.
#[test]
fn test_milestone_releaser_authority() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1200);

    let arbiter = account(&env);
    let metadata = empty_string(&env);
    let id = client.create_milestones(
        &sender,
        &recipient,
        &token.id,
        &vec![&env, 500, 500],
        &Some(arbiter.clone()),
        &metadata,
        &metadata,
    );

    // Recipient cannot release their own stream.
    assert_eq!(
        client.try_release_milestones(&id, &0, &recipient),
        Err(Ok(StreamError::Unauthorized)),
    );
    // The arbiter can, and so can the sender.
    client.release_milestones(&id, &0, &arbiter);
    client.release_milestones(&id, &1, &sender);
    assert_eq!(client.claimable(&id), 1000);

    // Without an arbiter, a third party is rejected.
    let outsider = account(&env);
    let id2 = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 200]);
    assert_eq!(
        client.try_release_milestones(&id2, &0, &outsider),
        Err(Ok(StreamError::Unauthorized)),
    );
}

/// Out-of-order, double and out-of-range releases are rejected with typed
/// errors, and only once the earlier tranches are released does the next
/// index unlock.
#[test]
fn test_milestone_release_ordering_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 600);

    let id = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 100, 200, 300]);

    // Releasing tranche 1 before tranche 0.
    assert_eq!(
        client.try_release_milestones(&id, &1, &sender),
        Err(Ok(StreamError::MilestoneOutOfOrder)),
    );
    // Index beyond the schedule.
    assert_eq!(
        client.try_release_milestones(&id, &3, &sender),
        Err(Ok(StreamError::MilestoneNotFound)),
    );

    client.release_milestones(&id, &0, &sender);
    // Re-releasing an already released tranche.
    assert_eq!(
        client.try_release_milestones(&id, &0, &sender),
        Err(Ok(StreamError::MilestoneAlreadyReleased)),
    );
    // Skipping forward once tranche 0 is out.
    assert_eq!(
        client.try_release_milestones(&id, &2, &sender),
        Err(Ok(StreamError::MilestoneOutOfOrder)),
    );
    // Nothing was paid by the failed attempts.
    assert_eq!(client.claimable(&id), 100);

    client.release_milestones(&id, &1, &sender);
    client.release_milestones(&id, &2, &sender);
    assert_eq!(client.claimable(&id), 600);
}

/// Cancel before all milestones are released refunds exactly the unreleased
/// tranches to the sender, keeps released tranches withdrawable by the
/// recipient, and blocks any further release.
#[test]
fn test_milestone_cancel_refunds_unreleased_and_keeps_released() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 250, 250, 500]);
    client.release_milestones(&id, &0, &sender);
    assert_eq!(client.claimable(&id), 250);

    client.cancel_milestones(&id);

    // Unreleased tranches (250 + 500) are refunded to the sender...
    assert_eq!(token.balance(&sender), 750);
    // ...the released tranche stays vested and claimable by the recipient...
    assert_eq!(client.vested(&id), 250);
    assert_eq!(client.claimable(&id), 250);
    assert_eq!(client.withdraw(&id), 250);
    assert_eq!(token.balance(&recipient), 250);
    assert_eq!(token.balance(&client.address), 0);
    // ...and the stream is cancelled for good.
    assert!(client.get_stream(&id).unwrap().cancelled);
    assert_eq!(
        client.try_release_milestones(&id, &1, &sender),
        Err(Ok(StreamError::AlreadyCancelled)),
    );
    assert_eq!(client.try_cancel_milestones(&id), Err(Ok(StreamError::AlreadyCancelled)),);
    // Money conservation: refund + payout == deposit, exactly.
    assert_eq!(token.balance(&sender) + token.balance(&recipient), 1000);
}

/// Cancelling a milestone stream before anything is released refunds the
/// entire deposit and leaves the recipient with nothing.
#[test]
fn test_milestone_cancel_before_any_release() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 900);

    let id = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 300, 300, 300]);
    client.cancel_milestones(&id);

    assert_eq!(token.balance(&sender), 900);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(client.claimable(&id), 0);
    assert_eq!(client.try_withdraw(&id), Err(Ok(StreamError::NothingToWithdraw)));
}

/// The two APIs refuse each other's streams: the linear `cancel` cannot be
/// used on a milestone stream (it would strand the unreleased tranches), and
/// the milestone operations refuse linear streams.
#[test]
fn test_milestone_and_linear_entry_points_are_disjoint() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 2000);

    let linear = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    let ms = create_ms(&env, &client, &sender, &recipient, &token.id, vec![&env, 1000]);

    assert_eq!(client.try_cancel(&ms), Err(Ok(StreamError::UseMilestoneCancel)),);
    assert_eq!(
        client.try_release_milestones(&linear, &0, &sender),
        Err(Ok(StreamError::NotMilestoneStream)),
    );
    assert_eq!(client.try_cancel_milestones(&linear), Err(Ok(StreamError::NotMilestoneStream)),);
    assert!(client.get_milestones(&linear).is_none());

    // The linear stream is untouched by any of the above.
    advance_time(&env, 1000);
    assert_eq!(client.withdraw(&linear), 1000);
}

/// Creation-time validation of the tranche schedule.
#[test]
fn test_milestone_invalid_schedules_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let metadata = empty_string(&env);

    // Empty schedule.
    assert_eq!(
        client.try_create_milestones(
            &sender,
            &recipient,
            &token.id,
            &Vec::new(&env),
            &None,
            &metadata,
            &metadata
        ),
        Err(Ok(StreamError::InvalidMilestones)),
    );
    // A zero or negative tranche amount.
    assert_eq!(
        client.try_create_milestones(
            &sender,
            &recipient,
            &token.id,
            &vec![&env, 100i128, 0, 900],
            &None,
            &metadata,
            &metadata
        ),
        Err(Ok(StreamError::InvalidMilestones)),
    );
    assert_eq!(
        client.try_create_milestones(
            &sender,
            &recipient,
            &token.id,
            &vec![&env, 100i128, -1, 901],
            &None,
            &metadata,
            &metadata
        ),
        Err(Ok(StreamError::InvalidMilestones)),
    );
    // More tranches than the cap allows (33 > MAX_TRANCHES).
    let filled = |n: u32| {
        let mut v = Vec::new(&env);
        for _ in 0..n {
            v.push_back(1i128);
        }
        v
    };
    let too_many = filled(33);
    assert_eq!(
        client.try_create_milestones(
            &sender, &recipient, &token.id, &too_many, &None, &metadata, &metadata
        ),
        Err(Ok(StreamError::InvalidMilestones)),
    );
    // At the cap it works.
    let at_cap = filled(32);
    let id = client
        .create_milestones(&sender, &recipient, &token.id, &at_cap, &None, &metadata, &metadata);
    assert_eq!(client.get_milestones(&id).unwrap().tranches.len(), 32);

    // The rejections happened before any transfer.
    assert_eq!(token.balance(&sender), 1000 - 32);
}

// ---------------------------------------------------------------------------
// Issue #83: cost measurement + boundary correctness of the views
// ---------------------------------------------------------------------------

/// Boundary-correctness pin for `claimable`/`vested`: every timestamp that
/// matters (before start, exactly start, exactly cliff, last ledger before
/// end, exactly end, far past end) is asserted, and `vesting_summary` always
/// agrees with the two single views. This is the correctness-preservation
/// gate for the read-count work below.
#[test]
fn test_claimable_vested_boundary_values() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    // 1000 over t=100..1100 with a cliff at t=300.
    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 100, 1100, 300);

    // Before the stream starts.
    advance_time(&env, 99);
    assert_eq!(client.vested(&id), 0);
    assert_eq!(client.claimable(&id), 0);

    // Exactly at start_time (still behind the cliff).
    advance_time(&env, 1);
    assert_eq!(env.ledger().timestamp(), 100);
    assert_eq!(client.vested(&id), 0);
    assert_eq!(client.claimable(&id), 0);

    // One ledger before the cliff: still nothing.
    advance_time(&env, 199);
    assert_eq!(client.claimable(&id), 0);

    // Exactly at the cliff: the elapsed-time share vests at once.
    advance_time(&env, 1);
    assert_eq!(env.ledger().timestamp(), 300);
    assert_eq!(client.vested(&id), 200);
    assert_eq!(client.claimable(&id), 200);

    // Last ledger before end_time: integer division truncates.
    advance_time(&env, 799);
    assert_eq!(env.ledger().timestamp(), 1099);
    assert_eq!(client.vested(&id), 999);
    assert_eq!(client.claimable(&id), 999);

    // Exactly end_time and beyond: the full amount.
    advance_time(&env, 1);
    assert_eq!(client.vested(&id), 1000);
    advance_time(&env, 10_000);
    assert_eq!(client.vested(&id), 1000);
    assert_eq!(client.claimable(&id), 1000);

    // Withdrawn bookkeeping keeps the views consistent at the boundaries too.
    assert_eq!(client.withdraw(&id), 1000);
    assert_eq!(client.claimable(&id), 0);
    assert_eq!(client.vested(&id), 1000);
    let summary = client.vesting_summary(&id);
    assert_eq!(summary.vested, 1000);
    assert_eq!(summary.claimable, 0);
}

/// Every point on the schedule satisfies `vesting_summary == (vested,
/// claimable)` of the dedicated views, including cancelled/compressed streams.
#[test]
fn test_vesting_summary_matches_views() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    for _ in 0..10 {
        advance_time(&env, 111);
        let s = client.vesting_summary(&id);
        assert_eq!(s.vested, client.vested(&id));
        assert_eq!(s.claimable, client.claimable(&id));
    }
    // Partially withdrawn state.
    client.withdraw(&id);
    let s = client.vesting_summary(&id);
    assert_eq!(s.claimable, 0);

    // Cancelled (schedule-compressed) state.
    advance_time(&env, 300);
    client.cancel(&id);
    let s = client.vesting_summary(&id);
    assert_eq!(s.vested, client.vested(&id));
    assert_eq!(s.claimable, client.claimable(&id));
}

/// Cost measurement for the two views and the combined `vesting_summary`.
///
/// `claimable` and `vested` each read exactly one ledger entry (the stream
/// itself) and write nothing; there is no redundant re-read or re-computation
/// inside either view. The only genuine redundancy is *across* the pair: a
/// caller that wants both numbers pays two full entry reads, so the new
/// `vesting_summary` view returns them from a single read.
///
/// The numbers below are from the host resource meter
/// (`env.cost_estimate().resources()`); native-Rust test contracts undercount
/// real WASM execution, but entry counts and relative costs are exact.
#[test]
fn test_claimable_vested_view_costs() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    advance_time(&env, 500);

    // `cost_estimate().resources()` reports the resources metered for the
    // last top-level invocation, and the budget counters reset at the start
    // of every top-level invocation: each measurement below therefore covers
    // exactly one view call.

    // Warm the footprint so the timed calls only measure the view itself.
    let _ = client.claimable(&id);
    let claimable = {
        let _ = client.claimable(&id);
        env.cost_estimate().resources()
    };
    let vested = {
        let _ = client.vested(&id);
        env.cost_estimate().resources()
    };
    let summary = {
        let _ = client.vesting_summary(&id);
        env.cost_estimate().resources()
    };

    // Total ledger entries read by each invocation (disk-backed plus
    // in-memory).
    let claimable_entries = claimable.disk_read_entries + claimable.memory_read_entries;
    let vested_entries = vested.disk_read_entries + vested.memory_read_entries;
    let summary_entries = summary.disk_read_entries + summary.memory_read_entries;

    println!(
        "claimable: entries={} instructions={} mem={} disk_reads={} writes={}",
        claimable_entries,
        claimable.instructions,
        claimable.mem_bytes,
        claimable.disk_read_entries,
        claimable.write_entries,
    );
    println!(
        "vested   : entries={} instructions={} mem={} disk_reads={} writes={}",
        vested_entries,
        vested.instructions,
        vested.mem_bytes,
        vested.disk_read_entries,
        vested.write_entries,
    );
    println!(
        "summary  : entries={} instructions={} mem={} disk_reads={} writes={}",
        summary_entries,
        summary.instructions,
        summary.mem_bytes,
        summary.disk_read_entries,
        summary.write_entries,
    );

    // Views are pure reads: neither writes anything.
    assert_eq!(claimable.write_entries, 0);
    assert_eq!(vested.write_entries, 0);
    assert_eq!(summary.write_entries, 0);

    // No redundant reads: each view touches exactly the same set of entries
    // (the stream entry plus the instance), and the summary touches the same
    // set once, not twice.
    assert_eq!(claimable_entries, vested_entries);
    assert_eq!(summary_entries, claimable_entries);

    // The combined view is cheaper than calling both views back to back
    // (which is how SDK/UI callers currently fetch the pair).
    assert!(
        summary.instructions < claimable.instructions + vested.instructions,
        "vesting_summary should cost less than claimable + vested"
    );

    // Budget-tracker cross-check (CPU modelled instructions per call).
    env.cost_estimate().budget().reset_default();
    let _ = client.claimable(&id);
    let cpu_claimable = env.cost_estimate().budget().cpu_instruction_cost();
    env.cost_estimate().budget().reset_default();
    let _ = client.vested(&id);
    let cpu_vested = env.cost_estimate().budget().cpu_instruction_cost();
    env.cost_estimate().budget().reset_default();
    let _ = client.vesting_summary(&id);
    let cpu_summary = env.cost_estimate().budget().cpu_instruction_cost();
    println!(
        "budget cpu: claimable={} vested={} summary={}",
        cpu_claimable, cpu_vested, cpu_summary
    );
    // Same entry, same arithmetic: the two views must be within a handful of
    // instructions of each other (`claimable` only subtracts `withdrawn`).
    let diff = cpu_claimable.abs_diff(cpu_vested);
    assert!(diff < 10_000, "claimable/vested cpu diverged: {}", diff);
}
