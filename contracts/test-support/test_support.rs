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
    testutils::{Address as _, Ledger},
    token, Address, Env, String,
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
