//! Test-only helpers shared by the `stream`, `splits` and `escrow` crates.
//!
//! Each crate's `#[cfg(test)] mod test` pulls this file in with `#[path]`, so it
//! is compiled into test binaries only and never into a released contract WASM.
//! The ledger clock starts at 0 in a fresh `Env`, which is what `advance_time`
//! advances from.

// Not every crate uses every helper, and an unused one would otherwise warn in
// the crates that do not.
#![allow(dead_code)]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
    token, Address, Env, String, Symbol, Val, Vec,
};

/// Registers a new random account.
pub fn account(env: &Env) -> Address {
    Address::generate(env)
}

/// An empty [`String`], for the calls whose metadata is unused.
pub fn empty_string(env: &Env) -> String {
    String::from_str(env, "")
}

/// Advances the ledger timestamp by `seconds`.
pub fn advance_time(env: &Env, seconds: u64) {
    let mut ledger = env.ledger().get();
    ledger.timestamp += seconds;
    env.ledger().set(ledger);
}

/// A deployed Stellar Asset Contract (SAC) test token.
pub struct TestToken<'a> {
    pub id: Address,
    pub client: token::Client<'a>,
    admin: token::StellarAssetClient<'a>,
}

impl<'a> TestToken<'a> {
    /// Deploys a fresh SAC with a throwaway admin.
    pub fn deploy(env: &'a Env) -> Self {
        let id = env.register_stellar_asset_contract_v2(Address::generate(env)).address();
        Self {
            client: token::Client::new(env, &id),
            admin: token::StellarAssetClient::new(env, &id),
            id,
        }
    }

    /// Mints `amount` of the token to `to`.
    pub fn mint(&self, to: &Address, amount: i128) {
        self.admin.mint(to, &amount);
    }

    /// The token balance of `who`.
    pub fn balance(&self, who: &Address) -> i128 {
        self.client.balance(who)
    }
}

// ---------------------------------------------------------------------------
// Hostile token (issue #79)
// ---------------------------------------------------------------------------
//
// A non-standard token contract used by the security tests of `stream`,
// `splits` and `escrow`. Unlike the Stellar Asset Contract it can:
//
//  1. silently move *less* than the requested amount on every transfer
//     ("shortfall"), and
//  2. re-enter the calling business contract in the middle of `transfer`
//     ("armed re-entry", consumed by the next transfer), emulating a token
//     that calls back into its caller.
//
// It keeps balances in plain storage and traps when the payer lacks funds,
// mirroring the one SAC guarantee the business contracts implicitly rely on.

/// A deferred re-entrant call: `transfer` invokes `func` on `contract` with
/// `args` after moving funds, exactly once.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReentryCall {
    pub contract: Address,
    pub func: Symbol,
    pub args: Vec<Val>,
}

#[contracttype]
#[derive(Clone)]
enum HostileKey {
    Balance(Address),
    /// Tokens withheld from *every* transfer while set.
    Shortfall,
    /// One-shot re-entrant call armed for the next transfer.
    Reentry,
}

#[contract]
pub struct HostileToken;

#[contractimpl]
impl HostileToken {
    /// Test-only faucet; no auth (the business contracts never call this).
    pub fn mint(env: Env, to: Address, amount: i128) {
        let key = HostileKey::Balance(to.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(bal + amount));
    }

    /// Mirrors the SAC's `balance` so `token::Client` works against this token.
    pub fn balance(env: Env, who: Address) -> i128 {
        env.storage().persistent().get(&HostileKey::Balance(who)).unwrap_or(0)
    }

    /// Arm a silent under-payment: every subsequent transfer moves
    /// `amount - shortfall` while reporting success to the caller.
    pub fn set_shortfall(env: Env, shortfall: i128) {
        env.storage().persistent().set(&HostileKey::Shortfall, &shortfall);
    }

    /// Remove the shortfall behaviour.
    pub fn clear_shortfall(env: Env) {
        env.storage().persistent().remove(&HostileKey::Shortfall);
    }

    /// Arm a one-shot re-entrant call executed during the next `transfer`.
    pub fn arm_reentry(env: Env, call: ReentryCall) {
        env.storage().persistent().set(&HostileKey::Reentry, &call);
    }

    /// Remove an armed re-entrant call without ever executing it. Needed to
    /// recover after a blocked re-entry, because the rolled-back invocation
    /// restores the flag together with everything else.
    pub fn disarm_reentry(env: Env) {
        env.storage().persistent().remove(&HostileKey::Reentry);
    }

    /// Mirrors the SAC's `transfer(from, to, amount)`, with two hostilities:
    /// an armed shortfall is skimmed off the top, and when the payer cannot
    /// cover the remainder the token delivers only what it holds instead of
    /// trapping — every under-payment is silent and "succeeds".
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        let shortfall: i128 = env.storage().persistent().get(&HostileKey::Shortfall).unwrap_or(0);
        let from_key = HostileKey::Balance(from.clone());
        let to_key = HostileKey::Balance(to.clone());
        let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);

        let mut moved = (amount - shortfall).max(0);
        if moved > from_bal {
            moved = from_bal;
        }
        env.storage().persistent().set(&from_key, &(from_bal - moved));
        env.storage().persistent().set(&to_key, &(to_bal + moved));

        if let Some(call) = env.storage().persistent().get::<_, ReentryCall>(&HostileKey::Reentry) {
            env.storage().persistent().remove(&HostileKey::Reentry);
            env.invoke_contract::<()>(&call.contract, &call.func, call.args);
        }
    }
}

/// Deploys the [`HostileToken`] and returns its address plus a client.
pub struct HostileTokenHandle<'a> {
    pub id: Address,
    pub client: HostileTokenClient<'a>,
    env: &'a Env,
}

impl<'a> HostileTokenHandle<'a> {
    pub fn deploy(env: &'a Env) -> Self {
        let id = env.register(HostileToken, ());
        Self { id: id.clone(), client: HostileTokenClient::new(env, &id), env }
    }

    /// The balance `who` holds in the hostile token.
    pub fn balance(&self, who: &Address) -> i128 {
        token::Client::new(self.env, &self.id).balance(who)
    }
}

/// Builds a [`ReentryCall`] for `contract.func(args...)`; every argument is
/// passed as a pre-converted `Val`.
pub fn reentry(env: &Env, contract: &Address, func: &str, args: Vec<Val>) -> ReentryCall {
    ReentryCall { contract: contract.clone(), func: Symbol::new(env, func), args }
}
