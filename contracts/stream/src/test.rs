#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
use super::*;
use soroban_sdk::{testutils::Events as _, Env, Event, String};

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, advance_time, empty_string, TestToken};

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
fn test_fee_cap_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 10000);

    let admin = account(&env);
    let treasury = account(&env);

    // Test 1: fee_bps == 1000 (the 10% cap) withdraws correctly.
    client.initialize(&admin, &treasury, &1000); // 10% fee
    let id = create(&env, &client, &sender, &recipient, &token.id, 10000, 0, 10000, 0);
    advance_time(&env, 1000);
    // 10% of 10000 = 1000 to treasury, 9000 to recipient.
    assert_eq!(client.withdraw(&id), 9000);
    assert_eq!(token.balance(&recipient), 9000);
    assert_eq!(token.balance(&treasury), 1000);

    // Test 2: fee_bps == 1001 returns InvalidFee (over the cap).
    let client2 = register(&env);
    let admin2 = account(&env);
    let treasury2 = account(&env);
    let res = client2.try_initialize(&admin2, &treasury2, &1001);
    assert_eq!(res, Err(Ok(StreamError::InvalidFee)));

    // Test 3: cliff_time == end_time releases everything at end_time.
    let client3 = register(&env);
    let (token3, sender3, recipient3, client3_) = setup(&env);
    token3.mint(&sender3, 1000);
    let admin3 = account(&env);
    let treasury3 = account(&env);
    client3_.initialize(&admin3, &treasury3, &100);
    let id3 = create(&env, &client3_, &sender3, &recipient3, &token3.id, 1000, 0, 1000, 0);
    // cliff_time == end_time == 1000, so at t=0 nothing is vested, at t=1000 everything is vested.
    assert_eq!(client3_.claimable(&id3), 0);
    advance_time(&env, 1000);
    assert_eq!(client3_.claimable(&id3), 1000);
    assert_eq!(client3_.withdraw(&id3), 900); // 10% fee
    assert_eq!(token3.balance(&recipient3), 900);
    assert_eq!(token3.balance(&treasury3), 100);

    // Test 4: withdrawing the full amount twice returns NothingToWithdraw the second time.
    let client4 = register(&env);
    let (token4, sender4, recipient4, client4_) = setup(&env);
    token4.mint(&sender4, 1000);
    let admin4 = account(&env);
    let treasury4 = account(&env);
    client4_.initialize(&admin4, &treasury4, &100);
    let id4 = create(&env, &client4_, &sender4, &recipient4, &token4.id, 1000, 0, 1000, 0);
    advance_time(&env, 1000);
    // First withdraw: full amount minus fee.
    assert_eq!(client4_.withdraw(&id4), 900);
    // Second withdraw: nothing left to withdraw.
    assert!(client4_.try_withdraw(&id4).is_err());
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

#[test]
fn test_transfer_recipient_mid_stream() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let new_recipient = account(&env);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    // The original recipient claims what has vested so far, then hands off.
    advance_time(&env, 300);
    assert_eq!(client.withdraw(&id), 300);
    client.transfer_recipient(&id, &recipient, &new_recipient);

    // Checked first: the event log only holds the most recent invocation's events.
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [StreamRecipientTransferred {
            id,
            old_recipient: recipient.clone(),
            new_recipient: new_recipient.clone(),
        }
        .to_xdr(&env, &client.address)],
    );

    // Only the recipient changes; the withdrawn amount and schedule are kept.
    let stream = client.get_stream(&id).unwrap();
    assert_eq!(stream.recipient, new_recipient);
    assert_eq!(stream.sender, sender);
    assert_eq!(stream.withdrawn, 300);
    assert_eq!(stream.total_amount, 1000);
    assert_eq!((stream.start_time, stream.end_time, stream.cliff_time), (0, 1000, 0));

    // Future withdrawals accrue to the new recipient.
    advance_time(&env, 200);
    assert_eq!(client.claimable(&id), 200);
    assert_eq!(client.withdraw(&id), 200);
    assert_eq!(token.balance(&new_recipient), 200);
    assert_eq!(token.balance(&recipient), 300);

    advance_time(&env, 500);
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&new_recipient), 700);
    assert_eq!(token.balance(&recipient), 300);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_transfer_recipient_moves_unclaimed_vested_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let new_recipient = account(&env);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    // Vested but never withdrawn: it is part of the remaining balance and moves.
    advance_time(&env, 400);
    client.transfer_recipient(&id, &recipient, &new_recipient);
    assert_eq!(client.withdraw(&id), 400);
    assert_eq!(token.balance(&new_recipient), 400);
    assert_eq!(token.balance(&recipient), 0);
}

#[test]
fn test_transfer_recipient_after_cancel_moves_vested_remainder() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let new_recipient = account(&env);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    advance_time(&env, 250);
    client.cancel(&id);

    client.transfer_recipient(&id, &recipient, &new_recipient);
    assert_eq!(client.withdraw(&id), 250);
    assert_eq!(token.balance(&new_recipient), 250);
    assert_eq!(token.balance(&sender), 750);
}

#[test]
fn test_transfer_recipient_rejects_non_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let outsider = account(&env);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    // Neither a third party nor the stream's own sender may redirect it.
    assert_eq!(
        client.try_transfer_recipient(&id, &outsider, &outsider),
        Err(Ok(StreamError::Unauthorized)),
    );
    assert_eq!(
        client.try_transfer_recipient(&id, &sender, &outsider),
        Err(Ok(StreamError::Unauthorized)),
    );
    assert_eq!(client.get_stream(&id).unwrap().recipient, recipient);
}

#[test]
fn test_transfer_recipient_requires_recipient_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);
    let new_recipient = account(&env);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    // Naming the recipient as `caller` is not enough without their signature.
    env.mock_auths(&[]);
    assert!(client.try_transfer_recipient(&id, &recipient, &new_recipient).is_err());

    env.mock_all_auths();
    assert_eq!(client.get_stream(&id).unwrap().recipient, recipient);
}

#[test]
fn test_transfer_recipient_to_same_address_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    assert_eq!(
        client.try_transfer_recipient(&id, &recipient, &recipient),
        Err(Ok(StreamError::SameRecipient)),
    );
}

#[test]
fn test_transfer_recipient_unknown_stream() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let caller = account(&env);
    let new_recipient = account(&env);
    assert_eq!(
        client.try_transfer_recipient(&99, &caller, &new_recipient),
        Err(Ok(StreamError::StreamNotFound)),
    );
}
