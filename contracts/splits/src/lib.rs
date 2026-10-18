#![no_std]

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
}

/// An immutable, reusable split configuration: a set of recipients with
/// proportional shares. Anyone may pay into it; funds are distributed on the
/// spot according to the shares.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Split {
    pub id: u64,
    pub creator: Address,
    pub recipients: Vec<Address>,
    pub shares: Vec<u32>,
    pub total_shares: u32,
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

        let id = next_id(&env);
        let split = Split { id, creator, recipients, shares, total_shares };

        let key = DataKey::Split(id);
        env.storage().persistent().set(&key, &split);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        SplitCreated { id, creator: split.creator.clone(), total_shares }.publish(&env);

        Ok(id)
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
        let split: Split =
            env.storage().persistent().get(&key).ok_or(SplitError::SplitNotFound)?;

        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&from, env.current_contract_address(), &amount);

        let len = split.recipients.len();
        let total = split.total_shares as i128;
        let mut distributed: i128 = 0;

        for i in 0..len {
            let recipient = split.recipients.get(i).unwrap();
            let portion = if i == len - 1 {
                amount - distributed
            } else {
                amount * split.shares.get(i).unwrap() as i128 / total
            };
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

    /// The id that will be assigned to the next split.
    pub fn next_split_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(1)
    }
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

mod test;
