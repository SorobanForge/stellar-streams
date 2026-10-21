#![no_std]
#![allow(clippy::too_many_arguments)]
use contract_version::CONTRACT_VERSION;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    EscrowNotFound = 1,
    // 2 was `EscrowAlreadyExists`, returned by `create_escrow` while ids were
    // caller-supplied. The contract now assigns ids, so a creation can no
    // longer collide and the variant is unreachable. The discriminant is
    // retired rather than reused so every other on-chain error code keeps its
    // value.
    InvalidAmount = 3,
    UnauthorizedOperation = 4,
    InvalidStateTransition = 5,
    DeadlineNotReached = 6,
    DeadlineExpired = 7,
    AlreadyFinalized = 8,
    InvalidDeadline = 9,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowStatus {
    Created = 0,
    Funded = 1,
    Released = 2,
    Refunded = 3,
    Cancelled = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: u64,
    pub payer: Address,
    pub payee: Address,
    pub arbiter: Address,
    pub token: Address,
    pub amount: i128,
    pub deadline: u64,
    pub status: EscrowStatus,
}

#[contracttype]
pub enum DataKey {
    Escrow(u64),
    NextId,
}

const BUMP_THRESHOLD: u32 = 17_280; // ~1 day of ledgers
const BUMP_LIMIT: u32 = 518_400; // ~30 days of ledgers

/// Emitted when an escrow agreement is created.
#[contractevent(topics = ["escrow", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCreated {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub amount: i128,
}

/// Emitted when an escrow is funded.
#[contractevent(topics = ["escrow", "funded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowFunded {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

/// Emitted when escrowed funds are released to the payee.
#[contractevent(topics = ["escrow", "released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowReleased {
    #[topic]
    pub id: u64,
    pub caller: Address,
    pub payee: Address,
    pub amount: i128,
}

/// Emitted when escrowed funds are refunded to the payer.
#[contractevent(topics = ["escrow", "refunded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRefunded {
    #[topic]
    pub id: u64,
    pub caller: Address,
    pub payer: Address,
    pub amount: i128,
}

/// Emitted when an escrow is cancelled.
#[contractevent(topics = ["escrow", "cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowCancelled {
    #[topic]
    pub id: u64,
    pub payer: Address,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow agreement. The contract assigns the id — the first
    /// escrow is `1` and every successful creation increments the counter — and
    /// returns it. Initial status is Created (unfunded).
    pub fn create_escrow(
        env: Env,
        payer: Address,
        payee: Address,
        arbiter: Address,
        token: Address,
        amount: i128,
        deadline: u64,
    ) -> Result<u64, EscrowError> {
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        // A deadline at or before the current ledger time would let the payer
        // cancel a funded escrow immediately, robbing the payee of the window
        // the deadline is supposed to guarantee.
        if deadline <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidDeadline);
        }

        payer.require_auth();

        // Everything that can reject the call has run, so the counter is only
        // incremented by a creation that will be stored.
        let id = next_id(&env);
        let escrow = Escrow {
            id,
            payer: payer.clone(),
            payee,
            arbiter,
            token,
            amount,
            deadline,
            status: EscrowStatus::Created,
        };

        let key = DataKey::Escrow(id);
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_LIMIT);

        EscrowCreated { id, payer, amount }.publish(&env);

        Ok(id)
    }

    /// Fund the escrow by transferring the specified amount of tokens from payer to this contract.
    pub fn fund_escrow(env: Env, id: u64) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Created {
            return Err(EscrowError::InvalidStateTransition);
        }

        escrow.payer.require_auth();

        // Perform token transfer
        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&escrow.payer, env.current_contract_address(), &escrow.amount);

        escrow.status = EscrowStatus::Funded;
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);

        EscrowFunded { id, amount: escrow.amount }.publish(&env);

        Ok(())
    }

    /// Release funds to the payee. Authorized by either the payer or the arbiter.
    pub fn release_escrow(env: Env, id: u64, caller: Address) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Funded {
            if escrow.status == EscrowStatus::Created {
                return Err(EscrowError::InvalidStateTransition);
            } else {
                return Err(EscrowError::AlreadyFinalized);
            }
        }

        caller.require_auth();
        if caller != escrow.payer && caller != escrow.arbiter {
            return Err(EscrowError::UnauthorizedOperation);
        }

        // Finalize before paying out, so the escrow is already closed to
        // `refund_escrow` and `cancel_escrow` while the token holds control.
        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.payee, &escrow.amount);

        EscrowReleased { id, caller, payee: escrow.payee.clone(), amount: escrow.amount }
            .publish(&env);

        Ok(())
    }

    /// Refund funds to the payer. Authorized by either the payee or the arbiter.
    pub fn refund_escrow(env: Env, id: u64, caller: Address) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Funded {
            if escrow.status == EscrowStatus::Created {
                return Err(EscrowError::InvalidStateTransition);
            } else {
                return Err(EscrowError::AlreadyFinalized);
            }
        }

        caller.require_auth();
        if caller != escrow.payee && caller != escrow.arbiter {
            return Err(EscrowError::UnauthorizedOperation);
        }

        // Finalize before refunding (see `release_escrow`).
        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.payer, &escrow.amount);

        EscrowRefunded { id, caller, payer: escrow.payer.clone(), amount: escrow.amount }
            .publish(&env);

        Ok(())
    }

    /// Cancel the escrow. Can be cancelled by payer immediately if unfunded (Created),
    /// or after the deadline has passed if funded (Funded).
    pub fn cancel_escrow(env: Env, id: u64, caller: Address) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        caller.require_auth();
        if caller != escrow.payer {
            return Err(EscrowError::UnauthorizedOperation);
        }

        let refund_payer = match escrow.status {
            // Unfunded, so there is nothing to send back.
            EscrowStatus::Created => false,
            EscrowStatus::Funded => {
                // Payer can only cancel if deadline has passed
                if env.ledger().timestamp() < escrow.deadline {
                    return Err(EscrowError::DeadlineNotReached);
                }
                true
            }
            EscrowStatus::Released | EscrowStatus::Refunded | EscrowStatus::Cancelled => {
                return Err(EscrowError::AlreadyFinalized);
            }
        };

        // Finalize before refunding (see `release_escrow`).
        escrow.status = EscrowStatus::Cancelled;
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);

        if refund_payer {
            let token_client = token::Client::new(&env, &escrow.token);
            token_client.transfer(&env.current_contract_address(), &escrow.payer, &escrow.amount);
        }

        EscrowCancelled { id, payer: escrow.payer.clone() }.publish(&env);

        Ok(())
    }

    /// Get escrow details by ID.
    pub fn get_escrow(env: Env, id: u64) -> Option<Escrow> {
        let key = DataKey::Escrow(id);
        env.storage().persistent().get(&key)
    }

    /// The id that will be assigned to the next escrow.
    pub fn next_escrow_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(1)
    }

    /// The contract interface version, shared by every contract in the
    /// workspace.
    pub fn version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

mod test;
