#![no_std]

use contract_version::CONTRACT_VERSION;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

const LEDGER_BUMP_THRESHOLD: u32 = 17_280;
const LEDGER_BUMP_LIMIT: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitError {
    EmptyRecipients = 1,
    LengthMismatch = 2,
    InvalidShares = 3,
    InvalidAmount = 4,
    DuplicateRecipient = 5,
    SplitNotFound = 6,
    Unauthorized = 7,
    ShareOverflow = 8,
    RecipientIndexOutOfBounds = 9,
    InvalidStateTransition = 10,
}

/// A reusable split configuration: a set of recipients with proportional
/// shares. Anyone may pay into it; funds are distributed on the spot according
/// to the shares. The creator may still replace the recipients and shares up to
/// the first distribution, after which the configuration is frozen.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub id: u64,
    pub creator: Address,
    pub recipients: Vec<Address>,
    pub shares: Vec<u32>,
    pub total_shares: u32,
    /// Set by the first `distribute`, which makes the configuration immutable.
    pub distributed: bool,
}

#[contracttype]
pub enum DataKey {
    Split(u64),
    NextId,
}

/// Emitted when a split configuration is created.
#[contractevent(topics = ["splits", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitCreated {
    #[topic]
    pub id: u64,
    pub creator: Address,
    pub total_shares: u32,
}

/// Emitted when a payment is distributed across a split's recipients.
#[contractevent(topics = ["splits", "distrib"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitDistributed {
    #[topic]
    pub id: u64,
    pub from: Address,
    pub token: Address,
    pub amount: i128,
}

#[contract]
pub struct SplitsContract;

#[contractimpl]
impl SplitsContract {
    /// Create a new split. `shares[i]` is the weight of `recipients[i]`.
    pub fn create_split(
        env: Env,
        creator: Address,
        recipients: Vec<Address>,
        shares: Vec<u32>,
    ) -> Result<u64, SplitError> {
        creator.require_auth();

        let total_shares = validate_split(&recipients, &shares)?;

        let id = next_id(&env);
        let split = Split { id, creator, recipients, shares, total_shares, distributed: false };

        let key = DataKey::Split(id);
        env.storage().persistent().set(&key, &split);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        SplitCreated { id, creator: split.creator.clone(), total_shares }.publish(&env);

        Ok(id)
    }

    /// Replace a split's recipients and shares before it has been distributed.
    ///
    /// Only the creator may call this, and only while no distribution has
    /// happened yet: once funds have been paid out the configuration is frozen,
    /// so a later change can never rewrite history. The vectors are validated
    /// exactly like [`SplitsContract::create_split`]'s (non-empty, same length,
    /// positive shares, no duplicate recipient, no share-sum overflow).
    pub fn update_shares(
        env: Env,
        split_id: u64,
        creator: Address,
        recipients: Vec<Address>,
        shares: Vec<u32>,
    ) -> Result<(), SplitError> {
        let key = DataKey::Split(split_id);
        let mut split: Split =
            env.storage().persistent().get(&key).ok_or(SplitError::SplitNotFound)?;

        creator.require_auth();
        if creator != split.creator {
            return Err(SplitError::Unauthorized);
        }
        if split.distributed {
            return Err(SplitError::InvalidStateTransition);
        }

        let total_shares = validate_split(&recipients, &shares)?;
        split.recipients = recipients;
        split.shares = shares;
        split.total_shares = total_shares;

        env.storage().persistent().set(&key, &split);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        Ok(())
    }

    /// Transfer `amount` of `token` from `from` and distribute it across the
    /// split's recipients in proportion to their shares. Any rounding dust is
    /// assigned to the final recipient so no funds are stranded.
    pub fn distribute(
        env: Env,
        split_id: u64,
        from: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), SplitError> {
        if amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        from.require_auth();

        let key = DataKey::Split(split_id);
        let mut split: Split =
            env.storage().persistent().get(&key).ok_or(SplitError::SplitNotFound)?;

        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&from, env.current_contract_address(), &amount);

        // The split is paid into from here on, so its configuration is frozen.
        split.distributed = true;
        env.storage().persistent().set(&key, &split);

        let len = split.recipients.len();
        let mut distributed: i128 = 0;

        for i in 0..len {
            let recipient = split.recipients.get(i).unwrap();
            let portion = recipient_portion(&split, i, amount, distributed);
            token_client.transfer(&env.current_contract_address(), &recipient, &portion);
            distributed += portion;
        }

        SplitDistributed { id: split_id, from, token, amount }.publish(&env);

        Ok(())
    }

    /// Fetch a split by id.
    pub fn get_split(env: Env, split_id: u64) -> Option<Split> {
        env.storage().persistent().get(&DataKey::Split(split_id))
    }

    /// Return the amount every recipient would receive for a hypothetical
    /// distribution, in the same order as `recipients`.
    ///
    /// The allocation is computed by the same rule `distribute` uses — integer
    /// shares plus the rounding dust assigned to the final recipient — so the
    /// returned vector sums to exactly `amount` and matches the transfers a real
    /// distribution of that amount would make.
    pub fn preview_distribution(
        env: Env,
        split_id: u64,
        amount: i128,
    ) -> Result<Vec<i128>, SplitError> {
        if amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        let split: Split = env
            .storage()
            .persistent()
            .get(&DataKey::Split(split_id))
            .ok_or(SplitError::SplitNotFound)?;

        let mut preview = Vec::new(&env);
        let mut distributed: i128 = 0;
        for i in 0..split.recipients.len() {
            let portion = recipient_portion(&split, i, amount, distributed);
            preview.push_back(portion);
            distributed += portion;
        }
        Ok(preview)
    }

    /// Return the amount a recipient would receive for a hypothetical distribution.
    /// The final recipient gets the remainder, matching `distribute` exactly.
    pub fn recipient_share(
        env: Env,
        split_id: u64,
        index: u32,
        amount: i128,
    ) -> Result<i128, SplitError> {
        if amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        let split: Split = env
            .storage()
            .persistent()
            .get(&DataKey::Split(split_id))
            .ok_or(SplitError::SplitNotFound)?;
        if index >= split.recipients.len() {
            return Err(SplitError::RecipientIndexOutOfBounds);
        }

        let mut distributed = 0;
        for i in 0..index {
            distributed += recipient_portion(&split, i, amount, distributed);
        }
        Ok(recipient_portion(&split, index, amount, distributed))
    }

    /// The id that will be assigned to the next split.
    pub fn next_split_id(env: Env) -> u64 {
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

/// The validation `create_split` and `update_shares` share, returning the
/// checked sum of the shares. Keeping it in one place means the two entry
/// points cannot accept different configurations.
fn validate_split(recipients: &Vec<Address>, shares: &Vec<u32>) -> Result<u32, SplitError> {
    let len = recipients.len();
    if len == 0 {
        return Err(SplitError::EmptyRecipients);
    }
    if shares.len() != len {
        return Err(SplitError::LengthMismatch);
    }

    let mut total_shares: u32 = 0;
    for i in 0..len {
        let share = shares.get(i).unwrap();
        if share == 0 {
            return Err(SplitError::InvalidShares);
        }
        let address = recipients.get(i).unwrap();
        for j in 0..i {
            if recipients.get(j).unwrap() == address {
                return Err(SplitError::DuplicateRecipient);
            }
        }
        total_shares = total_shares.checked_add(share).ok_or(SplitError::ShareOverflow)?;
    }

    Ok(total_shares)
}

fn recipient_portion(split: &Split, index: u32, amount: i128, distributed: i128) -> i128 {
    if index == split.recipients.len() - 1 {
        amount - distributed
    } else {
        amount * split.shares.get(index).unwrap() as i128 / split.total_shares as i128
    }
}

mod test;
