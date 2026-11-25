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
    token,
    xdr::{ScErrorCode, ScErrorType},
    Address, Env, Error, MuxedAddress, String, Symbol, Val, Vec,
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

/// A reentrant call the [`HostileToken`] makes from inside its next `transfer`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reentry {
    pub target: Address,
    pub func: Symbol,
    pub args: Vec<Val>,
    /// When `true` a rejected reentrant call is swallowed and the outer
    /// transfer carries on, the stronger attack: the victim keeps running
    /// after its callback misbehaved. When `false` the rejection propagates
    /// and aborts the whole invocation.
    pub swallow: bool,
}

/// What happened to the last reentrant call the hostile token attempted.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReentryOutcome {
    Succeeded,
    Failed(Error),
}

/// The outcome of a call the host refused because its contract was already
/// on the call stack.
pub fn reentry_rejected() -> ReentryOutcome {
    ReentryOutcome::Failed(Error::from_type_and_code(
        ScErrorType::Context,
        ScErrorCode::InvalidAction,
    ))
}

#[contracttype]
enum HostileKey {
    Balance(Address),
    Plan,
    Outcome,
}

/// A SEP-41 token that tries to reenter its caller from `transfer`.
///
/// It keeps just enough of the token interface for the contracts under test
/// (`transfer` and `balance`). The armed [`Reentry`] fires once, before any
/// balance moves, so the reentered contract sees the ledger exactly as it was
/// when it handed control to the token.
#[contract]
pub struct HostileTokenContract;

#[contractimpl]
impl HostileTokenContract {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let balance = Self::balance(env.clone(), to.clone());
        env.storage().instance().set(&HostileKey::Balance(to), &(balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().instance().get(&HostileKey::Balance(id)).unwrap_or(0)
    }

    pub fn arm(env: Env, plan: Reentry) {
        env.storage().instance().set(&HostileKey::Plan, &plan);
    }

    pub fn last_reentry(env: Env) -> Option<ReentryOutcome> {
        env.storage().instance().get(&HostileKey::Outcome)
    }

    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();

        let plan: Option<Reentry> = env.storage().instance().get(&HostileKey::Plan);
        if let Some(plan) = plan {
            // Disarm first so the attack is one-shot, even if it got through.
            env.storage().instance().remove(&HostileKey::Plan);
            let outcome = if plan.swallow {
                match env.try_invoke_contract::<Val, Error>(&plan.target, &plan.func, plan.args) {
                    Ok(_) => ReentryOutcome::Succeeded,
                    Err(Ok(error)) => ReentryOutcome::Failed(error),
                    Err(Err(_)) => panic!("reentrant call aborted without an error code"),
                }
            } else {
                env.invoke_contract::<Val>(&plan.target, &plan.func, plan.args);
                ReentryOutcome::Succeeded
            };
            env.storage().instance().set(&HostileKey::Outcome, &outcome);
        }

        let to = to.address();
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        env.storage().instance().set(&HostileKey::Balance(from), &(from_balance - amount));
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage().instance().set(&HostileKey::Balance(to), &(to_balance + amount));
    }
}

/// A deployed [`HostileTokenContract`] with test-side helpers.
pub struct HostileToken<'a> {
    pub id: Address,
    pub client: HostileTokenContractClient<'a>,
}

impl<'a> HostileToken<'a> {
    pub fn deploy(env: &'a Env) -> Self {
        let id = env.register(HostileTokenContract, ());
        Self { client: HostileTokenContractClient::new(env, &id), id }
    }

    pub fn mint(&self, to: &Address, amount: i128) {
        self.client.mint(to, &amount);
    }

    pub fn balance(&self, who: &Address) -> i128 {
        self.client.balance(who)
    }

    /// Arms a one-shot reentrant call to `target.func(args)`; see [`Reentry::swallow`].
    pub fn arm(&self, target: &Address, func: &str, args: Vec<Val>, swallow: bool) {
        let func = Symbol::new(self.id.env(), func);
        self.client.arm(&Reentry { target: target.clone(), func, args, swallow });
    }

    pub fn last_reentry(&self) -> Option<ReentryOutcome> {
        self.client.last_reentry()
    }
}
