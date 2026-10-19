#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
use super::*;
use soroban_sdk::{
    testutils::{Events as _, Ledger as _},
    Env, Event, String, Vec,
};
use proptest::prelude::*;

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

/// One `(recipient, amount, start_time, cliff_time, end_time)` batch entry, in
/// the order issue #184 specifies.
fn entry(
    recipient: &Address,
    amount: i128,
    start: u64,
    cliff: u64,
    end: u64,
) -> (Address, i128, u64, u64, u64) {
    (recipient.clone(), amount, start, cliff, end)
}

/// A batch of `count` distinct recipients, each streaming `amount`.
fn batch(env: &Env, count: u32, amount: i128) -> Vec<(Address, i128, u64, u64, u64)> {
    let mut entries = Vec::new(env);
    for i in 0..count {
        let recipient = account(env);
        let start = i as u64;
        entries.push_back(entry(&recipient, amount, start, start, start + 1000));
    }
    entries
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
fn test_withdraw_keeps_instance_config_alive() {
    let env = Env::default();
    env.mock_all_auths();
    // Start every entry with a long TTL so the token survives the ledger jumps
    // below; the instance then only outlives that TTL if a call bumps it.
    env.ledger().with_mut(|l| {
        l.min_persistent_entry_ttl = 600_000;
        l.max_entry_ttl = 3_000_000;
    });
    let (token, sender, recipient, client) = setup(&env);
    let admin = account(&env);
    client.initialize(&admin, &account(&env), &0);
    token.mint(&sender, 1000);
    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);
    advance_time(&env, 500);

    // Move close enough to expiry that the bump threshold is crossed, then
    // withdraw, which must extend the instance entry.
    env.ledger().with_mut(|l| l.sequence_number = 590_000);
    assert_eq!(client.withdraw(&id), 500);

    // Past the original expiry, the config is still readable.
    env.ledger().with_mut(|l| l.sequence_number = 650_000);
    assert!(client.get_config().is_some());
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
fn test_pause_freezes_accrual_until_resumed() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, recipient, client) = setup(&env);
    token.mint(&sender, 1000);

    let id = create(&env, &client, &sender, &recipient, &token.id, 1000, 0, 1000, 0);

    advance_time(&env, 250);
    assert_eq!(client.claimable(&id), 250);

    // Pausing freezes accrual and blocks withdrawal.
    client.pause(&id);
    advance_time(&env, 500);
    assert_eq!(client.claimable(&id), 250);
    assert_eq!(client.try_withdraw(&id), Err(Ok(StreamError::StreamPaused)));

    // Resuming folds the paused window out of the schedule.
    client.resume(&id);
    assert_eq!(client.claimable(&id), 250);
    advance_time(&env, 250);
    assert_eq!(client.claimable(&id), 500);
    assert_eq!(client.withdraw(&id), 500);
    assert_eq!(token.balance(&recipient), 500);

    // Both calls are idempotent.
    client.resume(&id);
    assert_eq!(client.claimable(&id), 0);

    let stream = client.get_stream(&id).unwrap();
    assert!(stream.paused_at.is_none());
    assert_eq!(stream.total_paused, 500);
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
fn test_set_fee_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let admin = account(&env);
    let treasury = account(&env);
    client.initialize(&admin, &treasury, &100);

    client.set_fee(&250);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [FeeUpdated { old_fee_bps: 100, new_fee_bps: 250 }.to_xdr(&env, &client.address)],
    );
}

#[test]
fn test_set_treasury_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let admin = account(&env);
    let treasury = account(&env);
    client.initialize(&admin, &treasury, &100);

    let new_treasury = account(&env);
    client.set_treasury(&new_treasury);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [TreasuryUpdated { treasury: new_treasury }.to_xdr(&env, &client.address)],
    );
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
    // Advance to `end_time` so the whole 10000 has vested.
    advance_time(&env, 10_000);
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
    let now = env.ledger().timestamp();
    let (token3, sender3, recipient3, client3) = setup(&env);
    token3.mint(&sender3, 1000);
    let admin3 = account(&env);
    let treasury3 = account(&env);
    client3.initialize(&admin3, &treasury3, &1000);
    let id3 = create(
        &env,
        &client3,
        &sender3,
        &recipient3,
        &token3.id,
        1000,
        now,
        now + 1000,
        now + 1000,
    );
    // cliff_time == end_time == now + 1000, so nothing is vested now and
    // everything is vested one second-equivalent later.
    assert_eq!(client3.claimable(&id3), 0);
    advance_time(&env, 1000);
    assert_eq!(client3.claimable(&id3), 1000);
    assert_eq!(client3.withdraw(&id3), 900); // 10% fee
    assert_eq!(token3.balance(&recipient3), 900);
    assert_eq!(token3.balance(&treasury3), 100);

    // Test 4: withdrawing the full amount twice returns NothingToWithdraw the second time.
    let _client4 = register(&env);
    let (token4, sender4, recipient4, client4_) = setup(&env);
    token4.mint(&sender4, 1000);
    let admin4 = account(&env);
    let treasury4 = account(&env);
    client4_.initialize(&admin4, &treasury4, &1000);
    let id4 = create(&env, &client4_, &sender4, &recipient4, &token4.id, 1000, 0, 1000, 0);
    advance_time(&env, 1000);
    // First withdraw: full amount minus fee (10% of 1000).
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
fn test_create_streams_creates_all_in_order() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    let alice = account(&env);
    let bob = account(&env);
    let carol = account(&env);
    token.mint(&sender, 6000);

    let entries = Vec::from_array(
        &env,
        [
            entry(&alice, 1000, 0, 0, 1000),
            entry(&bob, 2000, 100, 500, 1100),
            entry(&carol, 3000, 0, 600, 600),
        ],
    );

    let ids = client.create_streams(&sender, &token.id, &entries);

    // Ids are sequential, start at 1 and line up with the input order.
    assert_eq!(ids, Vec::from_array(&env, [1u64, 2, 3]));

    // One `created` event per entry, emitted in input order, carrying the same
    // payload `create_stream` would emit (checked first: each contract call
    // replaces the event log).
    let no_metadata = empty_string(&env);
    assert_eq!(
        env.events().all().filter_by_contract(&client.address),
        [
            StreamCreated {
                id: 1,
                sender: sender.clone(),
                recipient: alice.clone(),
                amount: 1000,
                label: no_metadata.clone(),
                reference: no_metadata.clone(),
            }
            .to_xdr(&env, &client.address),
            StreamCreated {
                id: 2,
                sender: sender.clone(),
                recipient: bob.clone(),
                amount: 2000,
                label: no_metadata.clone(),
                reference: no_metadata.clone(),
            }
            .to_xdr(&env, &client.address),
            StreamCreated {
                id: 3,
                sender: sender.clone(),
                recipient: carol.clone(),
                amount: 3000,
                label: no_metadata.clone(),
                reference: no_metadata.clone(),
            }
            .to_xdr(&env, &client.address),
        ],
    );

    // The counter advanced past every stream in the batch.
    assert_eq!(client.next_stream_id(), 4);

    // Every stream is stored in full, with empty metadata and no withdrawals.
    assert_eq!(
        client.get_stream(&1).unwrap(),
        Stream {
            id: 1,
            sender: sender.clone(),
            recipient: alice,
            token: token.id.clone(),
            total_amount: 1000,
            withdrawn: 0,
            start_time: 0,
            end_time: 1000,
            cliff_time: 0,
            label: no_metadata.clone(),
            reference: no_metadata.clone(),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        },
    );
    assert_eq!(client.get_stream(&2).unwrap().recipient, bob);
    assert_eq!(client.get_stream(&2).unwrap().cliff_time, 500);
    assert_eq!(client.get_stream(&3).unwrap().recipient, carol);
    assert_eq!(client.get_stream(&3).unwrap().end_time, 600);

    // The whole batch was pulled into the contract in one call.
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(token.balance(&client.address), 6000);

    // The streams vest independently: stream 2 starts at 100 and ends at 1100,
    // so at t=1000 it is 900/1000 vested.
    advance_time(&env, 1000);
    assert_eq!(client.claimable(&1), 1000);
    assert_eq!(client.claimable(&2), 1800);
    assert_eq!(client.claimable(&3), 3000);
}

#[test]
fn test_create_streams_matches_individual_creates() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let sender = account(&env);
    let alice = account(&env);
    let bob = account(&env);
    // Each contract funds its own streams, so mint enough for both runs.
    token.mint(&sender, 6000);

    let single = register(&env);
    let first = create(&env, &single, &sender, &alice, &token.id, 1000, 0, 1000, 0);
    let second = create(&env, &single, &sender, &bob, &token.id, 2000, 100, 1100, 500);
    assert_eq!(single.next_stream_id(), 3);

    let batch = register(&env);
    let entries =
        Vec::from_array(&env, [entry(&alice, 1000, 0, 0, 1000), entry(&bob, 2000, 100, 500, 1100)]);
    let ids = batch.create_streams(&sender, &token.id, &entries);

    // A batch of two is indistinguishable from two single creates: same ids,
    // same stored streams, same next id and same amount held per contract.
    assert_eq!(ids, Vec::from_array(&env, [first, second]));
    assert_eq!(batch.next_stream_id(), single.next_stream_id());
    for id in [first, second] {
        assert_eq!(batch.get_stream(&id), single.get_stream(&id));
    }
    assert_eq!(token.balance(&single.address), 3000);
    assert_eq!(token.balance(&batch.address), 3000);
    assert_eq!(token.balance(&sender), 0);
}

#[test]
fn test_create_streams_accepts_exactly_max_batch() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    token.mint(&sender, MAX_BATCH as i128 * 100);

    let entries = batch(&env, MAX_BATCH, 100);
    let ids = client.create_streams(&sender, &token.id, &entries);

    assert_eq!(ids.len(), MAX_BATCH);
    assert_eq!(ids.get(0).unwrap(), 1);
    assert_eq!(ids.get(MAX_BATCH - 1).unwrap(), MAX_BATCH as u64);
    assert_eq!(client.next_stream_id(), MAX_BATCH as u64 + 1);

    for id in 1..=MAX_BATCH as u64 {
        assert_eq!(client.get_stream(&id).unwrap().id, id);
    }
    assert_eq!(token.balance(&sender), 0);
    assert_eq!(token.balance(&client.address), MAX_BATCH as i128 * 100);
}

#[test]
fn test_create_streams_rejects_oversized_batch() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);

    let entries = batch(&env, MAX_BATCH + 1, 100);
    assert_eq!(
        client.try_create_streams(&sender, &token.id, &entries),
        Err(Ok(StreamError::BatchTooLarge)),
    );

    // Rejected before any transfer or storage write, so nothing to mint for.
    assert_eq!(client.next_stream_id(), 1);
    assert!(client.get_stream(&1).is_none());
    assert_eq!(token.balance(&sender), 0);
}

#[test]
fn test_create_streams_rejects_empty_batch() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);

    let entries: Vec<(Address, i128, u64, u64, u64)> = Vec::new(&env);
    assert_eq!(
        client.try_create_streams(&sender, &token.id, &entries),
        Err(Ok(StreamError::EmptyBatch)),
    );
    assert_eq!(client.next_stream_id(), 1);
}

#[test]
fn test_create_streams_uses_the_shared_validation_rules() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    let recipient = account(&env);

    // Each case is a single-entry batch whose error must be the same one
    // `create_stream` returns for the equivalent arguments.
    for (amount, start, cliff, end, expected) in [
        (0i128, 0u64, 0u64, 1000u64, StreamError::InvalidAmount),
        (100, 1000, 1000, 1000, StreamError::InvalidTimeRange),
        (100, 0, 2000, 1000, StreamError::InvalidCliff),
    ] {
        let entries = Vec::from_array(&env, [entry(&recipient, amount, start, cliff, end)]);
        assert_eq!(client.try_create_streams(&sender, &token.id, &entries), Err(Ok(expected)));
    }
    assert_eq!(client.next_stream_id(), 1);
}

#[test]
fn test_create_streams_is_all_or_nothing() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    token.mint(&sender, 1000);

    // One invalid entry (zero amount) in the first, middle and last position.
    for bad in [0u32, 2, 4] {
        let mut entries = Vec::new(&env);
        for i in 0..5 {
            let recipient = account(&env);
            let amount = if i == bad { 0 } else { 100 };
            entries.push_back(entry(&recipient, amount, 0, 0, 1000));
        }

        assert_eq!(
            client.try_create_streams(&sender, &token.id, &entries),
            Err(Ok(StreamError::InvalidAmount)),
        );

        // The valid entries around the bad one were never executed.
        assert_eq!(client.next_stream_id(), 1);
        assert_eq!(token.balance(&sender), 1000);
        assert_eq!(token.balance(&client.address), 0);
        for id in 1..=5u64 {
            assert!(client.get_stream(&id).is_none());
        }
    }
}

#[test]
fn test_create_streams_reverts_when_a_transfer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    // Enough for two of the three entries, so the last transfer fails inside
    // the token contract after the first two streams were written.
    token.mint(&sender, 200);

    let entries = batch(&env, 3, 100);
    assert!(client.try_create_streams(&sender, &token.id, &entries).is_err());

    // The failed invocation is rolled back as a whole: no streams, no consumed
    // ids and no tokens held by the contract.
    assert_eq!(client.next_stream_id(), 1);
    assert_eq!(token.balance(&sender), 200);
    assert_eq!(token.balance(&client.address), 0);
    for id in 1..=3u64 {
        assert!(client.get_stream(&id).is_none());
    }
}

#[test]
fn test_create_streams_rejects_overflowing_total() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    let alice = account(&env);
    let bob = account(&env);

    // Two individually valid amounts whose sum does not fit in an i128.
    let entries =
        Vec::from_array(&env, [entry(&alice, i128::MAX, 0, 0, 1000), entry(&bob, 1, 0, 0, 1000)]);
    assert_eq!(
        client.try_create_streams(&sender, &token.id, &entries),
        Err(Ok(StreamError::BatchOverflow)),
    );

    // The overflow check runs before the token is touched.
    assert_eq!(client.next_stream_id(), 1);
    assert_eq!(token.balance(&sender), 0);
}

#[test]
fn test_create_streams_requires_sender_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    token.mint(&sender, 1000);
    let entries = Vec::from_array(&env, [entry(&account(&env), 100, 0, 0, 1000)]);

    // Drop all mocked auths: the single `require_auth` for the sender must fail.
    env.mock_auths(&[]);
    assert!(client.try_create_streams(&sender, &token.id, &entries).is_err());
    assert_eq!(client.next_stream_id(), 1);
    assert_eq!(token.balance(&sender), 1000);
}

/// Proves that a full [`MAX_BATCH`] batch fits comfortably in a mainnet
/// transaction.
///
/// The limits are the mainnet values in
/// `soroban_env_host::InvocationResourceLimits::mainnet()` from
/// soroban-env-host 27.0.1 (the version the contract builds against). They are
/// spelled out here because the SDK does not re-export the limits and the
/// contract crate must not depend on the host. Every assertion keeps the
/// measured value under half of its limit, which leaves headroom for a future
/// field on [`Stream`] or [`StreamCreated`] to grow a max-size payroll batch
/// without silently crossing a network limit.
#[test]
fn test_create_streams_max_batch_fits_mainnet_limits() {
    const INSTRUCTIONS: i64 = 400_000_000;
    const MEM_BYTES: i64 = 41_943_040;
    const WRITE_ENTRIES: u32 = 200;
    const WRITE_BYTES: u32 = 132_096;
    const EVENTS_BYTES: u32 = 16_384;

    let env = Env::default();
    env.mock_all_auths();
    let (token, sender, _, client) = setup(&env);
    token.mint(&sender, MAX_BATCH as i128 * 100);

    let entries = batch(&env, MAX_BATCH, 100);
    let ids = client.create_streams(&sender, &token.id, &entries);
    assert_eq!(ids.len(), MAX_BATCH);

    let used = env.cost_estimate().resources();
    assert!(
        used.instructions < INSTRUCTIONS / 2,
        "instructions: {} of {}",
        used.instructions,
        INSTRUCTIONS,
    );
    assert!(used.mem_bytes < MEM_BYTES / 2, "memory: {} of {}", used.mem_bytes, MEM_BYTES);
    assert!(
        used.write_entries < WRITE_ENTRIES / 2,
        "write entries: {} of {}",
        used.write_entries,
        WRITE_ENTRIES,
    );
    assert!(
        used.write_bytes < WRITE_BYTES / 2,
        "write bytes: {} of {}",
        used.write_bytes,
        WRITE_BYTES,
    );
    assert!(
        used.contract_events_size_bytes < EVENTS_BYTES / 2,
        "event bytes: {} of {}",
        used.contract_events_size_bytes,
        EVENTS_BYTES,
    );
}

// Property-based tests for vesting function
proptest! {
    #[test]
    fn prop_vested_never_exceeds_total(
        total_amount in 1i128..1_000_000i128,
        start_time in 0u64..10_000u64,
        duration in 1u64..10_000u64,
        cliff_offset in 0u64..10_000u64,
        now_offset in 0u64..20_000u64
    ) {
        let end_time = start_time + duration;
        let cliff_time = (start_time + cliff_offset).min(end_time);
        let now = start_time + now_offset;

        let stream = Stream {
            id: 1,
            sender: Address::generate(&Env::default()),
            recipient: Address::generate(&Env::default()),
            token: Address::generate(&Env::default()),
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label: String::from_str(&Env::default(), ""),
            reference: String::from_str(&Env::default(), ""),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        };

        let vested = vested_amount(&stream, now);
        prop_assert!(vested <= total_amount, "vested {} should not exceed total {}", vested, total_amount);
    }

    #[test]
    fn prop_vested_is_monotonic(
        total_amount in 1i128..1_000_000i128,
        start_time in 0u64..10_000u64,
        duration in 1u64..10_000u64,
        cliff_offset in 0u64..10_000u64,
        now1_offset in 0u64..20_000u64,
        now2_offset in 0u64..20_000u64
    ) {
        let end_time = start_time + duration;
        let cliff_time = (start_time + cliff_offset).min(end_time);
        let now1 = start_time + now1_offset;
        let now2 = start_time + now2_offset;

        let stream = Stream {
            id: 1,
            sender: Address::generate(&Env::default()),
            recipient: Address::generate(&Env::default()),
            token: Address::generate(&Env::default()),
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label: String::from_str(&Env::default(), ""),
            reference: String::from_str(&Env::default(), ""),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        };

        let vested1 = vested_amount(&stream, now1);
        let vested2 = vested_amount(&stream, now2);

        if now2 >= now1 {
            prop_assert!(vested2 >= vested1, "vested should be monotonic: now1={}, vested1={}, now2={}, vested2={}", now1, vested1, now2, vested2);
        }
    }

    #[test]
    fn prop_vested_at_end_equals_total(
        total_amount in 1i128..1_000_000i128,
        start_time in 0u64..10_000u64,
        duration in 1u64..10_000u64,
        cliff_offset in 0u64..10_000u64
    ) {
        let end_time = start_time + duration;
        let cliff_time = (start_time + cliff_offset).min(end_time);

        let stream = Stream {
            id: 1,
            sender: Address::generate(&Env::default()),
            recipient: Address::generate(&Env::default()),
            token: Address::generate(&Env::default()),
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label: String::from_str(&Env::default(), ""),
            reference: String::from_str(&Env::default(), ""),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        };

        let vested = vested_amount(&stream, end_time);
        prop_assert_eq!(vested, total_amount, "vested at end_time should equal total");
    }

    #[test]
    fn prop_vested_zero_before_start(
        total_amount in 1i128..1_000_000i128,
        start_time in 100u64..10_000u64,
        duration in 1u64..10_000u64,
        cliff_offset in 0u64..10_000u64,
        before_offset in 1u64..100u64
    ) {
        let end_time = start_time + duration;
        let cliff_time = (start_time + cliff_offset).min(end_time);
        let now = start_time.saturating_sub(before_offset);

        let stream = Stream {
            id: 1,
            sender: Address::generate(&Env::default()),
            recipient: Address::generate(&Env::default()),
            token: Address::generate(&Env::default()),
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label: String::from_str(&Env::default(), ""),
            reference: String::from_str(&Env::default(), ""),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        };

        let vested = vested_amount(&stream, now);
        prop_assert_eq!(vested, 0, "vested before start_time should be zero");
    }

    #[test]
    fn prop_vested_zero_before_cliff(
        total_amount in 1i128..1_000_000i128,
        start_time in 0u64..10_000u64,
        duration in 1u64..10_000u64,
        cliff_offset in 1u64..10_000u64,
        before_cliff_offset in 1u64..100u64
    ) {
        let end_time = start_time + duration;
        let cliff_time = (start_time + cliff_offset).min(end_time);
        let now = cliff_time.saturating_sub(before_cliff_offset);

        let stream = Stream {
            id: 1,
            sender: Address::generate(&Env::default()),
            recipient: Address::generate(&Env::default()),
            token: Address::generate(&Env::default()),
            total_amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label: String::from_str(&Env::default(), ""),
            reference: String::from_str(&Env::default(), ""),
            cancelled: false,
            paused_at: None,
            total_paused: 0,
        };

        let vested = vested_amount(&stream, now);
        prop_assert_eq!(vested, 0, "vested before cliff_time should be zero");
    }
}
