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
/// Maximum number of streams a single [`StreamContract::create_streams`] call
/// may create.
///
/// A batch writes one stream entry and emits one [`StreamCreated`] event per
/// entry, so its cost grows linearly. Measured against the mainnet limits with
/// soroban-env-host 27 and empty metadata, every stream costs roughly 232k CPU
/// instructions, 33 KB of memory, one ledger-entry write and 548 event bytes.
/// The transaction event budget (16,384 bytes) is by far the tightest of those,
/// so `MAX_BATCH` is the largest batch whose events still fit in half of it
/// (14 × 548 = 7,672 bytes). That keeps the same 2× margin on every other limit
/// and leaves room for [`StreamCreated`] to grow without silently pushing a
/// maximum batch over a network limit. Larger payroll runs are submitted as
/// multiple batches.
pub const MAX_BATCH: u32 = 14;

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
    // 12 is intentionally skipped: it is claimed by in-flight PRs against this
    // enum. New variants continue from 13 so existing codes never shift.
    EmptyBatch = 13,
    BatchTooLarge = 14,
    BatchOverflow = 15,
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
    NextId,
    Admin,
    Treasury,
    FeeBps,
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

        validate_stream(amount, start_time, end_time, cliff_time, &label, &reference)?;

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

    /// Create many streams from one payroll-style batch in a single call.
    ///
    /// `sender` funds every stream and authorizes once for the whole batch: it is
    /// [`StreamContract::create_stream`]'s creator/funder (issue #184's `admin`),
    /// not the protocol `admin` set by [`StreamContract::initialize`]. `token` is
    /// the asset every stream locks.
    ///
    /// Each entry is `(recipient, amount, start_time, cliff_time, end_time)`, in
    /// the order given by issue #184, so the cliff comes before the end time
    /// (unlike `create_stream`). Batch entries carry no metadata: their `label`
    /// and `reference` are stored empty.
    ///
    /// The call is all-or-nothing: every entry is validated and the deposits are
    /// summed with checked arithmetic before any transfer or storage write, so one
    /// bad entry moves no tokens and leaves [`StreamContract::next_stream_id`]
    /// untouched. Empty batches return [`StreamError::EmptyBatch`], batches over
    /// [`MAX_BATCH`] [`StreamError::BatchTooLarge`].
    ///
    /// Ids are allocated and returned in input order: `ids[i]` belongs to
    /// `entries[i]`.
    pub fn create_streams(
        env: Env,
        sender: Address,
        token: Address,
        entries: Vec<(Address, i128, u64, u64, u64)>,
    ) -> Result<Vec<u64>, StreamError> {
        sender.require_auth();

        let count = entries.len();
        if count == 0 {
            return Err(StreamError::EmptyBatch);
        }
        if count > MAX_BATCH {
            return Err(StreamError::BatchTooLarge);
        }

        // Phase 1: validate the whole batch and sum the deposits with checked
        // arithmetic, before the token or the ledger is touched. Nothing here
        // can leave partial state behind. Each stream pulls its own deposit in
        // phase 2; the sum exists to reject a batch whose total would not fit in
        // an `i128` balance.
        let label = String::from_str(&env, "");
        let mut total_deposit: i128 = 0;
        for entry in entries.iter() {
            let (_, amount, start_time, cliff_time, end_time) = entry;
            validate_stream(amount, start_time, end_time, cliff_time, &label, &label)?;
            total_deposit = total_deposit.checked_add(amount).ok_or(StreamError::BatchOverflow)?;
        }
        debug_assert!(total_deposit > 0);

        // Phase 2: every entry passed, so the batch can now only fail on
        // ledger errors, which revert the whole invocation anyway.
        let first_id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let after_batch = first_id.checked_add(count as u64).ok_or(StreamError::BatchOverflow)?;
        // Reserve the whole id range once, mirroring `create_stream`'s
        // allocate-then-store order.
        env.storage().instance().set(&DataKey::NextId, &after_batch);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        let token_client = token::Client::new(&env, &token);
        let contract = env.current_contract_address();
        let mut ids = Vec::new(&env);
        for (id, entry) in (first_id..after_batch).zip(entries.iter()) {
            let (recipient, amount, start_time, cliff_time, end_time) = entry;

            // Pull each deposit separately, exactly like `create_stream`, so the
            // contract's balance and per-stream accounting match N individual
            // calls for any token, not just the built-in Stellar Asset Contract.
            token_client.transfer(&sender, &contract, &amount);

            let stream = Stream {
                id,
                sender: sender.clone(),
                recipient,
                token: token.clone(),
                total_amount: amount,
                withdrawn: 0,
                start_time,
                end_time,
                cliff_time,
                label: label.clone(),
                reference: label.clone(),
                cancelled: false,
            };

            let key = DataKey::Stream(id);
            env.storage().persistent().set(&key, &stream);
            env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

            StreamCreated {
                id,
                sender: stream.sender.clone(),
                recipient: stream.recipient.clone(),
                amount,
                label: stream.label.clone(),
                reference: stream.reference.clone(),
            }
            .publish(&env);

            ids.push_back(id);
        }

        Ok(ids)
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
    pub fn cancel(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

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

/// Checks the rules every stream must satisfy, whether it is created on its own
/// or as part of a batch.
///
/// Both [`StreamContract::create_stream`] and [`StreamContract::create_streams`]
/// run exactly this check before any token moves or any storage is written, so
/// the two entry points cannot drift apart. `end_time` is compared with
/// `start_time` before the cliff is checked, which keeps the error a caller sees
/// for a given input identical on both paths.
fn validate_stream(
    amount: i128,
    start_time: u64,
    end_time: u64,
    cliff_time: u64,
    label: &String,
    reference: &String,
) -> Result<(), StreamError> {
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
    Ok(())
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
