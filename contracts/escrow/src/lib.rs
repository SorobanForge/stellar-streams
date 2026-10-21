#![no_std]
#![allow(clippy::too_many_arguments)]
use contract_version::CONTRACT_VERSION;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
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
    MilestoneScheduleNotFound = 10,
    MilestoneIndexOutOfRange = 11,
    MilestoneAlreadyReleased = 12,
    MilestoneScheduleInvalid = 13,
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
    Milestones(u64),
    MilestoneReleased(u64),
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

/// Emitted when one milestone is released to the payee.
#[contractevent(topics = ["escrow", "milestone_released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneReleased {
    #[topic]
    pub id: u64,
    pub index: u32,
    pub caller: Address,
    pub payee: Address,
    pub amount: i128,
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

    /// Attach a milestone schedule to an unfunded escrow.
    ///
    /// `amounts` must contain at least two positive entries and sum to the
    /// escrow amount. Only the payer may configure the schedule, and only
    /// before the escrow is funded.
    pub fn set_milestones(
        env: Env,
        id: u64,
        caller: Address,
        amounts: Vec<i128>,
    ) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Created {
            return Err(EscrowError::InvalidStateTransition);
        }

        caller.require_auth();
        if caller != escrow.payer {
            return Err(EscrowError::UnauthorizedOperation);
        }

        if amounts.len() < 2 {
            return Err(EscrowError::MilestoneScheduleInvalid);
        }

        let mut total: i128 = 0;
        for amount in amounts.iter() {
            if amount <= 0 {
                return Err(EscrowError::MilestoneScheduleInvalid);
            }
            total = total.checked_add(amount).ok_or(EscrowError::MilestoneScheduleInvalid)?;
        }
        if total != escrow.amount {
            return Err(EscrowError::MilestoneScheduleInvalid);
        }

        let released = released_flags(&env, amounts.len());
        let milestones_key = DataKey::Milestones(id);
        let released_key = DataKey::MilestoneReleased(id);
        env.storage().persistent().set(&milestones_key, &amounts);
        env.storage().persistent().set(&released_key, &released);
        env.storage().persistent().extend_ttl(&milestones_key, BUMP_THRESHOLD, BUMP_LIMIT);
        env.storage().persistent().extend_ttl(&released_key, BUMP_THRESHOLD, BUMP_LIMIT);

        Ok(())
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

        // A milestone escrow must be released through `release_milestone`, so a
        // single full release can never bypass the schedule.
        if env.storage().persistent().has(&DataKey::Milestones(id)) {
            return Err(EscrowError::InvalidStateTransition);
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

    /// Release a single milestone to the payee.
    ///
    /// The payer or arbiter may release milestones while the escrow is funded
    /// and the deadline has not passed. A milestone can only be released once;
    /// releasing the final milestone marks the escrow as `Released`.
    pub fn release_milestone(
        env: Env,
        id: u64,
        milestone_index: u32,
        caller: Address,
    ) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(id);
        let mut escrow: Escrow =
            env.storage().persistent().get(&key).ok_or(EscrowError::EscrowNotFound)?;

        if escrow.status != EscrowStatus::Funded {
            return if escrow.status == EscrowStatus::Created {
                Err(EscrowError::InvalidStateTransition)
            } else {
                Err(EscrowError::AlreadyFinalized)
            };
        }

        caller.require_auth();
        if caller != escrow.payer && caller != escrow.arbiter {
            return Err(EscrowError::UnauthorizedOperation);
        }

        if env.ledger().timestamp() > escrow.deadline {
            return Err(EscrowError::DeadlineExpired);
        }

        let milestones_key = DataKey::Milestones(id);
        let amounts: Vec<i128> = env
            .storage()
            .persistent()
            .get(&milestones_key)
            .ok_or(EscrowError::MilestoneScheduleNotFound)?;
        if milestone_index >= amounts.len() {
            return Err(EscrowError::MilestoneIndexOutOfRange);
        }

        let released_key = DataKey::MilestoneReleased(id);
        let mut released: Vec<u32> = env
            .storage()
            .persistent()
            .get(&released_key)
            .ok_or(EscrowError::MilestoneScheduleNotFound)?;
        if released.get(milestone_index).unwrap_or(0) != 0 {
            return Err(EscrowError::MilestoneAlreadyReleased);
        }

        let amount = amounts.get(milestone_index).ok_or(EscrowError::MilestoneIndexOutOfRange)?;
        released.set(milestone_index, 1);

        let all_released = released.iter().all(|flag| flag != 0);
        if all_released {
            escrow.status = EscrowStatus::Released;
            env.storage().persistent().set(&key, &escrow);
            env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);
        }

        env.storage().persistent().set(&released_key, &released);
        env.storage().persistent().extend_ttl(&released_key, BUMP_THRESHOLD, BUMP_LIMIT);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.payee, &amount);

        MilestoneReleased {
            id,
            index: milestone_index,
            caller,
            payee: escrow.payee.clone(),
            amount,
        }
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

        let refundable = refundable_amount(&env, id, escrow.amount);

        // Finalize before refunding (see `release_escrow`).
        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_LIMIT);

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.payer, &refundable);

        EscrowRefunded { id, caller, payer: escrow.payer.clone(), amount: refundable }
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
            let refundable = refundable_amount(&env, id, escrow.amount);
            let token_client = token::Client::new(&env, &escrow.token);
            token_client.transfer(&env.current_contract_address(), &escrow.payer, &refundable);
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

    /// The milestone schedule attached to an escrow, if any.
    pub fn get_milestones(env: Env, id: u64) -> Option<Vec<i128>> {
        env.storage().persistent().get(&DataKey::Milestones(id))
    }

    /// Whether a specific milestone has been released.
    pub fn is_milestone_released(env: Env, id: u64, milestone_index: u32) -> bool {
        env.storage()
            .persistent()
            .get::<_, Vec<u32>>(&DataKey::MilestoneReleased(id))
            .and_then(|flags| flags.get(milestone_index))
            .unwrap_or(0)
            != 0
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

fn released_flags(env: &Env, len: u32) -> Vec<u32> {
    let mut flags = Vec::new(env);
    for _ in 0..len {
        flags.push_back(0);
    }
    flags
}

fn refundable_amount(env: &Env, id: u64, total: i128) -> i128 {
    let amounts: Option<Vec<i128>> = env.storage().persistent().get(&DataKey::Milestones(id));
    let Some(amounts) = amounts else {
        return total;
    };
    let released: Vec<u32> = env
        .storage()
        .persistent()
        .get(&DataKey::MilestoneReleased(id))
        .unwrap_or_else(|| released_flags(env, amounts.len()));

    let mut released_total: i128 = 0;
    for (index, flag) in released.iter().enumerate() {
        if flag != 0 {
            released_total = released_total.saturating_add(amounts.get(index as u32).unwrap_or(0));
        }
    }
    total.saturating_sub(released_total)
}

mod test;
