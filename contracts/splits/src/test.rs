#![cfg(test)]
#![allow(elided_lifetimes_in_paths, mismatched_lifetime_syntaxes)]
use super::*;
use soroban_sdk::{vec, Env, IntoVal};

#[path = "../../test-support/test_support.rs"]
mod support;
use support::{account, reentry_rejected, HostileToken, TestToken};

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

/// A 75 / 25 split and a payer holding 2000 [`HostileToken`]s.
///
/// Non-root auth is allowed so a reentrant call would clear `require_auth`:
/// the host's reentry check is the only thing left standing in its way.
fn hostile_split(
    env: &Env,
) -> (HostileToken<'_>, Address, Address, Address, SplitsContractClient<'_>, u64) {
    env.mock_all_auths_allowing_non_root_auth();
    let token = HostileToken::deploy(env);
    let payer = account(env);
    token.mint(&payer, 2000);
    let client = register(env);
    let a = account(env);
    let b = account(env);
    let id = client.create_split(
        &account(env),
        &vec![env, a.clone(), b.clone()],
        &vec![env, 3u32, 1u32],
    );
    (token, payer, a, b, client, id)
}

#[test]
fn test_distribute_rejects_reentrant_distribute() {
    let env = Env::default();
    let (token, payer, a, b, client, id) = hostile_split(&env);

    let args = vec![
        &env,
        id.into_val(&env),
        payer.into_val(&env),
        token.id.into_val(&env),
        1000i128.into_val(&env),
    ];
    token.arm(&client.address, "distribute", args, true);
    client.distribute(&id, &payer, &token.id, &1000);

    // One distribution's worth moved; the reentrant second payment never ran.
    assert_eq!(token.last_reentry(), Some(reentry_rejected()));
    assert_eq!(token.balance(&payer), 1000);
    assert_eq!(token.balance(&a), 750);
    assert_eq!(token.balance(&b), 250);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn test_propagated_reentry_rolls_back_the_whole_distribute() {
    let env = Env::default();
    let (token, payer, a, b, client, id) = hostile_split(&env);

    let args = vec![
        &env,
        id.into_val(&env),
        payer.into_val(&env),
        token.id.into_val(&env),
        1000i128.into_val(&env),
    ];
    token.arm(&client.address, "distribute", args, false);
    assert!(client.try_distribute(&id, &payer, &token.id, &1000).is_err());

    assert_eq!(token.balance(&payer), 2000);
    assert_eq!(token.balance(&a), 0);
    assert_eq!(token.balance(&b), 0);
    assert_eq!(token.balance(&client.address), 0);
    assert_eq!(token.last_reentry(), None);
}
