#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
extern crate std;
use super::*;
use soroban_sdk::{vec, Env, IntoVal};

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, reentry, HostileTokenHandle, TestToken};

fn register(env: &Env) -> SplitsContractClient<'_> {
    SplitsContractClient::new(env, &env.register(SplitsContract, ()))
}

#[test]
fn test_create_and_distribute() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    token.mint(&payer, 1000);
    let client = register(&env);

    let creator = account(&env);
    let a = account(&env);
    let b = account(&env);

    // 75 / 25 split.
    let id =
        client.create_split(&creator, &vec![&env, a.clone(), b.clone()], &vec![&env, 3u32, 1u32]);
    assert_eq!(id, 1);

    client.distribute(&id, &payer, &token.id, &1000);
    assert_eq!(token.balance(&a), 750);
    assert_eq!(token.balance(&b), 250);
    assert_eq!(token.balance(&payer), 0);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_rounding_dust_goes_to_last_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    token.mint(&payer, 100);
    let client = register(&env);

    let creator = account(&env);
    let a = account(&env);
    let b = account(&env);
    let c = account(&env);

    // Equal thirds of 100 -> 33, 33, 34.
    let id = client.create_split(
        &creator,
        &vec![&env, a.clone(), b.clone(), c.clone()],
        &vec![&env, 1u32, 1u32, 1u32],
    );
    client.distribute(&id, &payer, &token.id, &100);

    assert_eq!(token.balance(&a), 33);
    assert_eq!(token.balance(&b), 33);
    assert_eq!(token.balance(&c), 34);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_invalid_splits() {
    let env = Env::default();
    env.mock_all_auths();
    let client = register(&env);
    let creator = account(&env);
    let a = account(&env);
    let b = account(&env);

    // Empty recipients.
    assert_eq!(
        client.try_create_split(&creator, &vec![&env], &vec![&env]),
        Err(Ok(SplitError::EmptyRecipients)),
    );

    // Length mismatch (two recipients, one share).
    assert_eq!(
        client.try_create_split(&creator, &vec![&env, a.clone(), b.clone()], &vec![&env, 1u32]),
        Err(Ok(SplitError::LengthMismatch)),
    );

    // Zero share.
    assert_eq!(
        client.try_create_split(&creator, &vec![&env, a.clone()], &vec![&env, 0u32]),
        Err(Ok(SplitError::InvalidShares)),
    );

    // Duplicate recipient.
    assert_eq!(
        client.try_create_split(
            &creator,
            &vec![&env, a.clone(), a.clone()],
            &vec![&env, 1u32, 1u32]
        ),
        Err(Ok(SplitError::DuplicateRecipient)),
    );
}

#[test]
fn test_distribute_validations() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    let client = register(&env);
    let creator = account(&env);
    let a = account(&env);

    let id = client.create_split(&creator, &vec![&env, a.clone()], &vec![&env, 1u32]);

    // Unknown split.
    assert_eq!(
        client.try_distribute(&99, &payer, &token.id, &10),
        Err(Ok(SplitError::SplitNotFound)),
    );

    // Non-positive amount.
    assert_eq!(
        client.try_distribute(&id, &payer, &token.id, &0),
        Err(Ok(SplitError::InvalidAmount)),
    );
}

#[test]
fn test_single_recipient_gets_everything() {
    let env = Env::default();
    env.mock_all_auths();
    let token = TestToken::deploy(&env);
    let payer = account(&env);
    token.mint(&payer, 500);
    let client = register(&env);

    let creator = account(&env);
    let a = account(&env);
    let id = client.create_split(&creator, &vec![&env, a.clone()], &vec![&env, 7u32]);

    client.distribute(&id, &payer, &token.id, &500);
    assert_eq!(token.balance(&a), 500);

    let split = client.get_split(&id).unwrap();
    assert_eq!(split.total_shares, 7);
    assert_eq!(client.next_split_id(), 2);
}

// ---------------------------------------------------------------------------
// Issue #79: behaviour with a hostile token contract
// ---------------------------------------------------------------------------
//
// `distribute` pulls the payment in and pushes the portions out through
// `token::Client::transfer`, verifying neither what arrives nor what leaves.
// These tests pin the behaviour against a token that re-enters the contract
// or silently short-transfers. See SECURITY.md ("Known Limitations").

/// A token that tries to re-enter `distribute` while its inbound transfer is
/// in flight targets the same contract instance, which the host forbids: the
/// nested call traps and the whole distribution aborts. Nothing is moved, the
/// split's accounting is untouched, and once the token's one-shot re-entry
/// flag is disarmed the distribution proceeds exactly as with a honest token.
#[test]
fn test_hostile_token_reentry_on_distribute_is_blocked_by_the_host() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let payer = account(&env);
    token.client.mint(&payer, &1000);
    let client = register(&env);

    let creator = account(&env);
    let a = account(&env);
    let b = account(&env);
    let id =
        client.create_split(&creator, &vec![&env, a.clone(), b.clone()], &vec![&env, 3u32, 1u32]);

    // The next token transfer re-enters `distribute` on this very contract,
    // attempting to distribute a second, overlapping payment of 400.
    token.client.arm_reentry(&reentry(
        &env,
        &client.address,
        "distribute",
        vec![
            &env,
            id.into_val(&env),
            payer.into_val(&env),
            token.id.into_val(&env),
            400i128.into_val(&env),
        ],
    ));
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.distribute(&id, &payer, &token.id, &1000)
    }));
    let _ = std::panic::take_hook();
    assert!(outcome.is_err(), "same-contract re-entry must abort the invocation");

    // Today's outcome: the failed invocation is rolled back in full — no
    // funds moved anywhere and no split state was written.
    assert_eq!(token.balance(&payer), 1000);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(token.balance(&a), 0);
    assert_eq!(token.balance(&b), 0);

    // The rollback also restores the token's one-shot flag, so every further
    // distribution attempt traps for as long as it stays armed: re-entry is a
    // denial of service here, not a way to corrupt shares.
    std::panic::set_hook(std::boxed::Box::new(|_| {}));
    let second = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.distribute(&id, &payer, &token.id, &1000)
    }));
    let _ = std::panic::take_hook();
    assert!(second.is_err());

    // Disarmed, the split behaves exactly like the honest-token tests.
    token.client.disarm_reentry();
    client.distribute(&id, &payer, &token.id, &1000);
    assert_eq!(token.balance(&a), 750);
    assert_eq!(token.balance(&b), 250);
    assert_eq!(token.balance(&payer), 0);
    assert_eq!(token.balance(&client.address), 0);
}

/// A token that delivers less than requested on every leg is trusted blindly.
/// `distribute` returns `Ok` and publishes a `SplitDistributed` event for the
/// full amount, but each recipient receives short and un-distributed dust
/// stays stranded inside the contract: the split's proportional promise is
/// silently broken and nobody can tell from the return value.
#[test]
fn test_hostile_token_short_transfer_distorts_distribute() {
    let env = Env::default();
    env.mock_all_auths();
    let token = HostileTokenHandle::deploy(&env);
    let payer = account(&env);
    token.client.mint(&payer, &1000);
    let client = register(&env);

    let creator = account(&env);
    let a = account(&env);
    let b = account(&env);
    let id =
        client.create_split(&creator, &vec![&env, a.clone(), b.clone()], &vec![&env, 3u32, 1u32]);

    // Skim 200 off every transfer, including all three legs of the split.
    token.client.set_shortfall(&200);
    client.distribute(&id, &payer, &token.id, &1000);

    // Inbound leg moved 800 of the promised 1000; the 750 portion to `a`
    // delivered 550 and the final 250 portion to `b` delivered 50.
    assert_eq!(token.balance(&payer), 200);
    assert_eq!(token.balance(&a), 550);
    assert_eq!(token.balance(&b), 50);
    // 200 of the deposit never left the contract — stranded dust, and the
    // 3:1 ratio now reads 550:50.
    assert_eq!(token.balance(&client.address), 200);
}
