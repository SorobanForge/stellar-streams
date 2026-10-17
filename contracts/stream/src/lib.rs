#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String, Vec,
};

/// Number of ledgers before a persistent entry is bumped (~1 day at 5s ledgers).
const LEDGER_BUMP_THRESHOLD: u32 = 17_280;
/// Maximum number of ledgers a persistent entry can be extended by (~30 days).
const LEDGER_BUMP_LIMIT: u32 = 518_400;
/// Hard cap on the protocol fee (10%).
const MAX_FEE_BPS: u32 = 1_000;
/// Longest accepted stream label, in bytes. Bounded so rent stays predictable.
const MAX_LABEL_LEN: u32 = 64;
/// Longest accepted external reference (invoice, grant or payroll id), in bytes.
const MAX_REFERENCE_LEN: u32 = 128;
/// Maximum number of tranches a milestone stream may carry. Bounded so the
/// tranche vector keeps rent and iteration costs predictable.
const MAX_TRANCHES: u32 = 32;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StreamError {
    InvalidAmount = 1,
    InvalidTimeRange = 2,
    InvalidCliff = 3,
    StreamNotFound = 4,
    NothingToWithdraw = 5,
    Unauthorized = 6,
    InvalidFee = 7,
    AlreadyCancelled = 8,
    AlreadyInitialized = 9,
    TreasuryNotSet = 10,
    MetadataTooLong = 11,
    MilestoneNotFound = 12,
    MilestoneAlreadyReleased = 13,
    MilestoneOutOfOrder = 14,
    InvalidMilestones = 15,
    NotMilestoneStream = 16,
    UseMilestoneCancel = 17,
}

/// A single linear payment stream. Tokens are locked in the contract and vest
/// continuously between `start_time` and `end_time`, with an optional cliff.
///
/// `label` and `reference` are optional metadata: they are stored as empty
/// strings when the creator does not supply them and never affect vesting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub withdrawn: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub cliff_time: u64,
    pub label: String,
    pub reference: String,
    pub cancelled: bool,
}

/// Protocol-level configuration, set once at initialization.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub treasury: Address,
    pub fee_bps: u32,
}

#[contracttype]
pub enum DataKey {
    Stream(u64),
    Milestones(u64),
    NextId,
    Admin,
    Treasury,
    FeeBps,
}

/// One tranche of a milestone (non-linear) stream. Tranches are released in
/// index order; a released tranche is instantly vested and becomes withdrawable
/// by the recipient through the regular `withdraw` entry point.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tranche {
    pub amount: i128,
    pub released: bool,
}

/// The milestone schedule attached to a stream created by
/// [`StreamContract::create_milestones`]. Linear streams have no such entry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneSet {
    /// Optional secondary releaser. When `None`, only the sender may release.
    pub arbiter: Option<Address>,
    pub tranches: Vec<Tranche>,
}

/// Both vesting numbers of a stream, computed from a single storage read.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSummary {
    pub vested: i128,
    pub claimable: i128,
}

/// Emitted when a stream is created.
#[contractevent(topics = ["stream", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCreated {
    #[topic]
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    /// Amount locked, in the token's smallest unit.
    pub amount: i128,
    pub label: String,
    pub reference: String,
}

/// Emitted when the recipient withdraws a stream's vested balance.
#[contractevent(topics = ["stream", "withdrawn"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamWithdrawn {
    #[topic]
    pub id: u64,
    pub recipient: Address,
    /// Amount sent to the recipient, after any protocol fee.
    pub amount: i128,
    pub fee: i128,
}

/// Emitted when the sender cancels a stream.
#[contractevent(topics = ["stream", "cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCancelled {
    #[topic]
    pub id: u64,
    pub sender: Address,
    /// Unvested amount refunded to the sender.
    pub refunded: i128,
}

/// Emitted when a milestone (tranche-based) stream is created.
#[contractevent(topics = ["stream", "milestone_created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneStreamCreated {
    #[topic]
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    /// Total amount locked across all tranches, in the token's smallest unit.
    pub amount: i128,
    pub tranche_count: u32,
}

/// Emitted when a tranche of a milestone stream is released.
#[contractevent(topics = ["stream", "milestone_released"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneReleased {
    #[topic]
    pub id: u64,
    #[topic]
    pub index: u32,
    pub caller: Address,
    /// Amount that just vested with this release.
    pub amount: i128,
}

#[contract]
pub struct StreamContract;

#[contractimpl]
impl StreamContract {
    /// Configure the protocol fee and treasury. Can only be called once.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        fee_bps: u32,
    ) -> Result<(), StreamError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(StreamError::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(StreamError::InvalidFee);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        Ok(())
    }

    /// Update the protocol fee. Only callable by the configured admin.
    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), StreamError> {
        let admin: Address =
            env.storage().instance().get(&DataKey::Admin).ok_or(StreamError::Unauthorized)?;
        if fee_bps > MAX_FEE_BPS {
            return Err(StreamError::InvalidFee);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        Ok(())
    }

    /// Update the treasury address. Only callable by the configured admin.
    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), StreamError> {
        let admin: Address =
            env.storage().instance().get(&DataKey::Admin).ok_or(StreamError::Unauthorized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        Ok(())
    }

    /// Lock `amount` of `token` and begin streaming it from `sender` to `recipient`.
    /// Returns the new stream id.
    ///
    /// `label` and `reference` carry optional human-readable metadata (a payroll
    /// label, an invoice or grant id). Pass empty strings to omit them; they are
    /// capped at [`MAX_LABEL_LEN`] and [`MAX_REFERENCE_LEN`] bytes so the stream's
    /// rent stays predictable.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        start_time: u64,
        end_time: u64,
        cliff_time: u64,
        label: String,
        reference: String,
    ) -> Result<u64, StreamError> {
        sender.require_auth();

        if amount <= 0 {
            return Err(StreamError::InvalidAmount);
        }
        if end_time <= start_time {
            return Err(StreamError::InvalidTimeRange);
        }
        if cliff_time < start_time || cliff_time > end_time {
            return Err(StreamError::InvalidCliff);
        }
        if label.len() > MAX_LABEL_LEN || reference.len() > MAX_REFERENCE_LEN {
            return Err(StreamError::MetadataTooLong);
        }

        // Pull the full stream amount into the contract up front.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, env.current_contract_address(), &amount);

        let id = next_id(&env);
        let stream = Stream {
            id,
            sender,
            recipient,
            token,
            total_amount: amount,
            withdrawn: 0,
            start_time,
            end_time,
            cliff_time,
            label,
            reference,
            cancelled: false,
        };

        let key = DataKey::Stream(id);
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamCreated {
            id,
            sender: stream.sender.clone(),
            recipient: stream.recipient.clone(),
            amount,
            label: stream.label.clone(),
            reference: stream.reference.clone(),
        }
        .publish(&env);

        Ok(id)
    }

    /// Withdraw the currently vested (and not yet withdrawn) amount to the recipient.
    /// Returns the net amount transferred after any protocol fee.
    pub fn withdraw(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        stream.recipient.require_auth();

        let now = env.ledger().timestamp();
        let vested = vested_amount(&stream, now);
        let claimable = vested - stream.withdrawn;
        if claimable <= 0 {
            return Err(StreamError::NothingToWithdraw);
        }

        let fee = claimable * fee_bps(&env) as i128 / 10_000;
        let net = claimable - fee;

        let token_client = token::Client::new(&env, &stream.token);
        if fee > 0 {
            let treasury: Address = env
                .storage()
                .instance()
                .get(&DataKey::Treasury)
                .ok_or(StreamError::TreasuryNotSet)?;
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &net);

        stream.withdrawn += claimable;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamWithdrawn { id: stream_id, recipient: stream.recipient.clone(), amount: net, fee }
            .publish(&env);

        Ok(net)
    }

    /// Cancel a stream. The sender is refunded the unvested portion immediately,
    /// while the recipient keeps the right to withdraw everything already vested.
    ///
    /// Milestone streams must use [`StreamContract::cancel_milestones`] instead:
    /// their `Stream` schedule only tracks the released tranches, so a refund
    /// computed through this linear path would strand the unreleased funds.
    pub fn cancel(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        if env.storage().persistent().has(&DataKey::Milestones(stream_id)) {
            return Err(StreamError::UseMilestoneCancel);
        }

        stream.sender.require_auth();

        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }

        let now = env.ledger().timestamp();
        let vested = vested_amount(&stream, now);
        let unvested = stream.total_amount - vested;

        if unvested > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(&env.current_contract_address(), &stream.sender, &unvested);
        }

        // Compress the schedule so the vested remainder becomes fully withdrawable.
        stream.total_amount = vested;
        stream.start_time = now;
        stream.end_time = now;
        stream.cliff_time = now;
        stream.cancelled = true;

        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamCancelled { id: stream_id, sender: stream.sender.clone(), refunded: unvested }
            .publish(&env);

        Ok(())
    }

    /// Create a milestone (non-linear) stream: `amounts[i]` is the size of
    /// tranche `i`, and the full sum is locked in the contract up front.
    /// Tranches vest only when released, never by the clock.
    ///
    /// `arbiter` is an optional second releaser; pass `None` to restrict
    /// releases to the sender. The recipient withdraws released tranches
    /// through the ordinary [`StreamContract::withdraw`] entry point, and the
    /// sender reclaims unreleased tranches with
    /// [`StreamContract::cancel_milestones`].
    pub fn create_milestones(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amounts: Vec<i128>,
        arbiter: Option<Address>,
        label: String,
        reference: String,
    ) -> Result<u64, StreamError> {
        sender.require_auth();

        let count = amounts.len();
        if count == 0 || count > MAX_TRANCHES {
            return Err(StreamError::InvalidMilestones);
        }
        let mut total: i128 = 0;
        for i in 0..count {
            let amount = amounts.get(i).unwrap();
            if amount <= 0 {
                return Err(StreamError::InvalidMilestones);
            }
            total += amount;
        }
        if label.len() > MAX_LABEL_LEN || reference.len() > MAX_REFERENCE_LEN {
            return Err(StreamError::MetadataTooLong);
        }

        // Pull the full milestone amount into the contract up front.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, env.current_contract_address(), &total);

        let now = env.ledger().timestamp();
        let id = next_id(&env);

        // The stream's schedule is stored in "fully vested" form and only ever
        // grows through released tranches, so the existing withdraw machinery
        // applies unchanged: vested == total_amount == sum of released tranches.
        let stream = Stream {
            id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            total_amount: 0,
            withdrawn: 0,
            start_time: now,
            end_time: now,
            cliff_time: now,
            label,
            reference,
            cancelled: false,
        };

        let mut tranches = Vec::new(&env);
        for i in 0..count {
            tranches.push_back(Tranche { amount: amounts.get(i).unwrap(), released: false });
        }
        let milestones = MilestoneSet { arbiter, tranches };

        let key = DataKey::Stream(id);
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        let mkey = DataKey::Milestones(id);
        env.storage().persistent().set(&mkey, &milestones);
        env.storage().persistent().extend_ttl(&mkey, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        MilestoneStreamCreated { id, sender, recipient, amount: total, tranche_count: count }
            .publish(&env);

        Ok(id)
    }

    /// Release tranche `index` of a milestone stream, making its amount
    /// instantly vested and withdrawable by the recipient. Only the sender or
    /// the configured arbiter may release, and tranches must be released in
    /// order: releasing tranche `i` requires tranches `0..i` to be released.
    pub fn release_milestones(
        env: Env,
        stream_id: u64,
        index: u32,
        caller: Address,
    ) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;
        let mkey = DataKey::Milestones(stream_id);
        let mut milestones: MilestoneSet =
            env.storage().persistent().get(&mkey).ok_or(StreamError::NotMilestoneStream)?;

        caller.require_auth();
        if caller != stream.sender && milestones.arbiter.as_ref() != Some(&caller) {
            return Err(StreamError::Unauthorized);
        }
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }

        let count = milestones.tranches.len();
        if index >= count {
            return Err(StreamError::MilestoneNotFound);
        }
        let tranche = milestones.tranches.get(index).unwrap();
        if tranche.released {
            return Err(StreamError::MilestoneAlreadyReleased);
        }
        for i in 0..index {
            if !milestones.tranches.get(i).unwrap().released {
                return Err(StreamError::MilestoneOutOfOrder);
            }
        }

        milestones.tranches.set(index, Tranche { amount: tranche.amount, released: true });

        // The released tranche becomes fully vested: grow the schedule's total
        // and collapse the window so `vested_amount` equals `total_amount`.
        let now = env.ledger().timestamp();
        stream.total_amount += tranche.amount;
        stream.start_time = now;
        stream.end_time = now;
        stream.cliff_time = now;

        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().persistent().set(&mkey, &milestones);
        env.storage().persistent().extend_ttl(&mkey, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        MilestoneReleased { id: stream_id, index, caller, amount: tranche.amount }.publish(&env);

        Ok(())
    }

    /// Cancel a milestone stream. The sender is refunded every unreleased
    /// tranche immediately; released tranches stay vested and remain
    /// withdrawable by the recipient through [`StreamContract::withdraw`].
    /// Further releases are blocked (`AlreadyCancelled`).
    pub fn cancel_milestones(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;
        let mkey = DataKey::Milestones(stream_id);
        let milestones: MilestoneSet =
            env.storage().persistent().get(&mkey).ok_or(StreamError::NotMilestoneStream)?;

        stream.sender.require_auth();
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }

        let mut unreleased: i128 = 0;
        for i in 0..milestones.tranches.len() {
            let tranche = milestones.tranches.get(i).unwrap();
            if !tranche.released {
                unreleased += tranche.amount;
            }
        }

        if unreleased > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(&env.current_contract_address(), &stream.sender, &unreleased);
        }

        // `total_amount` already equals the released (vested) sum; collapse the
        // schedule so it stays fully withdrawable after the cancellation.
        let now = env.ledger().timestamp();
        stream.start_time = now;
        stream.end_time = now;
        stream.cliff_time = now;
        stream.cancelled = true;

        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamCancelled { id: stream_id, sender: stream.sender.clone(), refunded: unreleased }
            .publish(&env);

        Ok(())
    }

    /// Fetch the milestone schedule of a stream, or `None` for linear streams.
    pub fn get_milestones(env: Env, stream_id: u64) -> Option<MilestoneSet> {
        env.storage().persistent().get(&DataKey::Milestones(stream_id))
    }

    /// View the amount currently available for the recipient to withdraw.
    pub fn claimable(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        let now = env.ledger().timestamp();
        let vested = vested_amount(&stream, now);
        Ok((vested - stream.withdrawn).max(0))
    }

    /// View the total amount vested so far (withdrawn + claimable).
    pub fn vested(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        Ok(vested_amount(&stream, env.ledger().timestamp()))
    }

    /// View both `vested` and `claimable` from a single storage read. Callers
    /// that need the two numbers together avoid reading (and deserializing)
    /// the stream entry twice by using this instead of calling both views.
    pub fn vesting_summary(env: Env, stream_id: u64) -> Result<VestingSummary, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        let vested = vested_amount(&stream, env.ledger().timestamp());
        Ok(VestingSummary { vested, claimable: (vested - stream.withdrawn).max(0) })
    }

    /// Fetch a stream by id.
    pub fn get_stream(env: Env, stream_id: u64) -> Option<Stream> {
        env.storage().persistent().get(&DataKey::Stream(stream_id))
    }

    /// Fetch the protocol configuration (returns `None` if uninitialized).
    pub fn get_config(env: Env) -> Option<Config> {
        let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
        let treasury: Option<Address> = env.storage().instance().get(&DataKey::Treasury);
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        match (admin, treasury) {
            (Some(admin), Some(treasury)) => Some(Config { admin, treasury, fee_bps }),
            _ => None,
        }
    }

    /// The id that will be assigned to the next stream.
    pub fn next_stream_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(1)
    }
}

/// Linearly vested amount of a stream at a given timestamp.
fn vested_amount(stream: &Stream, now: u64) -> i128 {
    if now < stream.start_time || now < stream.cliff_time {
        return 0;
    }
    if now >= stream.end_time {
        return stream.total_amount;
    }
    let elapsed = (now - stream.start_time) as i128;
    let duration = (stream.end_time - stream.start_time) as i128;
    stream.total_amount * elapsed / duration
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

fn fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
}

mod test;
