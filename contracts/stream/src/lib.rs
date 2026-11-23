#![no_std]
#![allow(clippy::too_many_arguments)]
// `test_claimable_vested_view_costs` prints the numbers it measures, which is the
// only reason the test build needs `std` in this otherwise `no_std` crate.
#[cfg(test)]
extern crate std;

use contract_version::CONTRACT_VERSION;
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
/// Longest a single pause may suppress accrual, in seconds (30 days).
///
/// Issue #299: `pause` used to freeze a stream until the sender chose to
/// `resume` it, which could push the recipient past the agreed end date for an
/// unbounded time. A pause now only counts for at most this window; once it has
/// lapsed the stream accrues again on its own, even though `paused_at` is still
/// recorded, so `withdraw` and the vesting views stop treating it as paused.
/// The pause is capped rather than rejected so the recipient can never be
/// locked out: a sender who wants to keep a stream frozen has to `pause` again
/// to open a fresh window.
pub const MAX_PAUSE_SECONDS: u64 = 2_592_000;
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
    InvalidStartTime = 12,
    EmptyBatch = 13,
    BatchTooLarge = 14,
    BatchOverflow = 15,
    /// Issue #182: `withdraw` was called while the stream is paused.
    StreamPaused = 16,
    /// Issue #182: reserved for future strict-idempotency variant.
    NotPaused = 17,
    /// Issue #181: `top_up` was called after the stream's schedule had ended.
    StreamCompleted = 18,
    /// Issue #181: `top_up` arithmetic would exceed the supported range.
    AmountOverflow = 19,
    /// Issue #80: `reduce_stream` was asked for a total below what has vested.
    ReductionBelowVested = 20,
    /// Issue #80: `reduce_stream` was asked for a total that is not a reduction.
    InvalidReduction = 21,
    SameRecipient = 22,
    /// Issue #299: `resume` arrived after the pause had already lapsed on its
    /// own (`now - paused_at > MAX_PAUSE_SECONDS`). The stream is not frozen:
    /// vesting and `withdraw` have already resumed it.
    PauseWindowExceeded = 23,
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
    /// Issue #182: timestamp at which the stream was last paused (`None` when running).
    pub paused_at: Option<u64>,
    /// Issue #182: total seconds the stream has spent paused; subtracted from
    /// elapsed time in `vested_amount`.
    pub total_paused: u64,
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

/// Both vesting numbers of a stream, computed from a single storage read.
/// Issue #83: callers that poll a stream for what is vested *and* what the
/// recipient can take right now used to pay two full reads of the same entry
/// by calling `vested` and `claimable` back to back.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSummary {
    pub vested: i128,
    pub claimable: i128,
}

/// What a `withdraw` call would pay right now. Issue #300: clients mirror the
/// fee split off-chain, which let the two drift. `preview_withdraw` returns the
/// numbers the contract itself would use, from the same lookups as `withdraw`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawPreview {
    /// Gross claimable amount before the protocol fee.
    pub gross: i128,
    /// Protocol fee that would be sent to the treasury.
    pub fee: i128,
    /// Amount the recipient would actually receive.
    pub net: i128,
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

/// Emitted when the sender reduces a stream's total without cancelling it.
#[contractevent(topics = ["stream", "reduced"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamReduced {
    #[topic]
    pub id: u64,
    pub sender: Address,
    /// The stream's new total, in the token's smallest unit.
    pub new_total: i128,
    /// The difference refunded to the sender.
    pub refunded: i128,
}

/// Emitted when the admin changes the protocol fee.
#[contractevent(topics = ["stream", "fee_set"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeUpdated {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
}

/// Emitted when the admin changes the treasury address.
#[contractevent(topics = ["stream", "treasury"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    pub treasury: Address,
}

#[contractevent]
pub struct StreamPaused {
    #[topic]
    pub id: u64,
    pub paused_at: u64,
}

#[contractevent]
pub struct StreamResumed {
    #[topic]
    pub id: u64,
    pub resumed_at: u64,
    pub total_paused: u64,
}

/// Emitted when the sender replaces a stream's label and reference.
/// Issue #297: metadata used to be fixed at creation.
#[contractevent(topics = ["stream", "metadata"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamMetadataUpdated {
    #[topic]
    pub id: u64,
    pub sender: Address,
    pub label: String,
    pub reference: String,
}

/// Emitted when the recipient hands a stream off to a new address.
#[contractevent(topics = ["stream", "transferred"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamRecipientTransferred {
    #[topic]
    pub id: u64,
    pub old_recipient: Address,
    pub new_recipient: Address,
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
        let old_fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        FeeUpdated { old_fee_bps, new_fee_bps: fee_bps }.publish(&env);
        Ok(())
    }

    /// Update the treasury address. Only callable by the configured admin.
    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), StreamError> {
        let admin: Address =
            env.storage().instance().get(&DataKey::Admin).ok_or(StreamError::Unauthorized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        TreasuryUpdated { treasury }.publish(&env);
        Ok(())
    }

    /// Lock `amount` of `token` and begin streaming it from `sender` to `recipient`.
    /// Returns the new stream id.
    ///
    /// `label` and `reference` carry optional human-readable metadata (a payroll
    /// label, an invoice or grant id). Pass empty strings to omit them; they are
    /// capped at [`MAX_LABEL_LEN`] and [`MAX_REFERENCE_LEN`] bytes so the stream's
    /// rent stays predictable.
    ///
    /// `start_time` must not be in the past: it has to be at or after the current
    /// ledger timestamp, otherwise [`StreamError::InvalidStartTime`] is returned.
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

        validate_stream(&env, amount, start_time, end_time, cliff_time, &label, &reference)?;

        // Pull the full stream amount into the contract up front, so a stream is
        // never recorded without the funds that back it.
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
            paused_at: None,
            total_paused: 0,
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
            validate_stream(&env, amount, start_time, end_time, cliff_time, &label, &label)?;
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
                paused_at: None,
                total_paused: 0,
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

    /// Add `amount` to a stream's deposit while preserving its payment rate.
    ///
    /// Only the stream's sender (the payer) may top it up, and only while the
    /// stream is still streaming: cancelled streams and streams whose schedule
    /// has already ended are rejected. The end time is extended by
    /// `amount * duration / total_amount`, so tokens that have already vested
    /// stay vested and the recipient keeps earning at the same pace.
    pub fn top_up(env: Env, stream_id: u64, amount: i128) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        stream.sender.require_auth();

        if amount <= 0 {
            return Err(StreamError::InvalidAmount);
        }
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }
        if env.ledger().timestamp() >= stream.end_time {
            return Err(StreamError::StreamCompleted);
        }

        // Extend the schedule at the stream's current rate. Flooring the
        // division can only nudge the new rate up, never make already-vested
        // tokens vest again more slowly.
        let duration = i128::from(stream.end_time - stream.start_time);
        let extension =
            amount.checked_mul(duration).ok_or(StreamError::AmountOverflow)? / stream.total_amount;
        let extension = u64::try_from(extension).map_err(|_| StreamError::AmountOverflow)?;
        let new_end_time =
            stream.end_time.checked_add(extension).ok_or(StreamError::AmountOverflow)?;
        let new_total =
            stream.total_amount.checked_add(amount).ok_or(StreamError::AmountOverflow)?;

        // Persist before the transfer, like `withdraw`, so a token callback can
        // never observe a deposit that has not been fully recorded yet.
        stream.total_amount = new_total;
        stream.end_time = new_end_time;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        token::Client::new(&env, &stream.token).transfer(
            &stream.sender,
            env.current_contract_address(),
            &amount,
        );

        Ok(())
    }

    /// Reduce a stream's total without cancelling it.
    ///
    /// Only the stream's sender may reduce it, and the new total must be a
    /// positive amount strictly below the current total but at least the amount
    /// already vested. The difference is refunded to the sender immediately.
    ///
    /// The schedule keeps the stream's current payment rate: `end_time` shrinks
    /// by `new_total * duration / total_amount`, so already-vested tokens stay
    /// vested and the recipient keeps earning at the same pace until the
    /// reduced total runs out. Unlike [`StreamContract::cancel`], the stream is
    /// not marked cancelled and its vested balance remains withdrawable.
    pub fn reduce_stream(env: Env, stream_id: u64, new_total: i128) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        stream.sender.require_auth();

        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }
        if new_total <= 0 || new_total >= stream.total_amount {
            return Err(StreamError::InvalidReduction);
        }

        let now = env.ledger().timestamp();
        let vested = vested_amount(&stream, now);
        if new_total < vested {
            return Err(StreamError::ReductionBelowVested);
        }

        // Shrink the schedule at the stream's current rate. Rounding the new
        // duration down can only raise the rate slightly, never shrink an
        // amount that has already vested.
        let duration = i128::from(stream.end_time - stream.start_time);
        let new_duration = new_total.checked_mul(duration).ok_or(StreamError::AmountOverflow)?
            / stream.total_amount;
        let new_duration = u64::try_from(new_duration).map_err(|_| StreamError::AmountOverflow)?;
        let new_end_time =
            stream.start_time.checked_add(new_duration).ok_or(StreamError::AmountOverflow)?;
        let refunded = stream.total_amount - new_total;

        // Persist before refunding, like `withdraw`, so a token callback can
        // never observe tokens that have not been fully recorded yet.
        stream.total_amount = new_total;
        stream.end_time = new_end_time;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &stream.sender,
            &refunded,
        );

        StreamReduced { id: stream_id, sender: stream.sender.clone(), new_total, refunded }
            .publish(&env);

        Ok(())
    }

    /// Withdraw the currently vested (and not yet withdrawn) amount to the recipient.
    /// Returns the net amount transferred after any protocol fee.
    pub fn withdraw(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        let now = env.ledger().timestamp();
        if is_actively_paused(&stream, now) {
            return Err(StreamError::StreamPaused);
        }
        stream.recipient.require_auth();

        let vested = vested_amount(&stream, now);
        let claimable = vested - stream.withdrawn;
        if claimable <= 0 {
            return Err(StreamError::NothingToWithdraw);
        }

        let split = withdraw_split(&env, claimable)?;
        let (fee, net) = (split.fee, split.net);

        // Record the withdrawal before calling out to the token, so a token that
        // calls back into this contract can only ever see the stream already
        // debited. A failed transfer still rolls this write back with the rest
        // of the invocation.
        stream.withdrawn += claimable;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        let token_client = token::Client::new(&env, &stream.token);
        if let Some(treasury) = split.treasury {
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &net);

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

        // Compress the schedule so the vested remainder becomes fully withdrawable,
        // and persist it before the refund leaves the contract (see `withdraw`).
        stream.total_amount = vested;
        stream.start_time = now;
        stream.end_time = now;
        stream.cliff_time = now;
        stream.cancelled = true;

        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        if unvested > 0 {
            let token_client = token::Client::new(&env, &stream.token);
            token_client.transfer(&env.current_contract_address(), &stream.sender, &unvested);
        }

        StreamCancelled { id: stream_id, sender: stream.sender.clone(), refunded: unvested }
            .publish(&env);

        Ok(())
    }

    /// Hand a stream off to `new_recipient`, e.g. after a key rotation or a sale.
    ///
    /// Only the current recipient may call this: `caller` must authorize and
    /// match the stored recipient, otherwise the call fails with `Unauthorized`.
    /// Amounts already withdrawn stay where they are; everything not yet
    /// withdrawn — including a balance that has vested but was never claimed —
    /// becomes withdrawable by `new_recipient` only. A recipient who wants to
    /// keep the vested part should `withdraw` before transferring.
    pub fn transfer_recipient(
        env: Env,
        stream_id: u64,
        caller: Address,
        new_recipient: Address,
    ) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        caller.require_auth();
        if caller != stream.recipient {
            return Err(StreamError::Unauthorized);
        }
        if new_recipient == stream.recipient {
            return Err(StreamError::SameRecipient);
        }

        let old_recipient = core::mem::replace(&mut stream.recipient, new_recipient);
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamRecipientTransferred {
            id: stream_id,
            old_recipient,
            new_recipient: stream.recipient.clone(),
        }
        .publish(&env);

        Ok(())
    }

    /// Replace a stream's `label` and `reference`. Only the stream's sender may
    /// call it, and only while the stream is not cancelled. Issue #297.
    ///
    /// Payroll and grant teams need to attach an invoice id, or correct a typo,
    /// after the stream exists. `sender` is an explicit argument rather than an
    /// implicit auth of the stored address so that any other signer gets a typed
    /// [`StreamError::Unauthorized`] instead of a host auth trap, the same way
    /// [`StreamContract::transfer_recipient`] checks its caller.
    ///
    /// The same length caps as [`StreamContract::create_stream`] apply, through
    /// the same check: over-long input returns [`StreamError::MetadataTooLong`]
    /// and leaves the stored metadata untouched. A cancelled stream is rejected
    /// with [`StreamError::AlreadyCancelled`] because its schedule has already
    /// been compressed and its metadata is part of the settled record. Metadata
    /// never affects vesting or balances, and the entry's TTL is bumped so the
    /// new values survive as long as the stream does.
    pub fn set_metadata(
        env: Env,
        stream_id: u64,
        sender: Address,
        label: String,
        reference: String,
    ) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;

        sender.require_auth();
        if sender != stream.sender {
            return Err(StreamError::Unauthorized);
        }
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }
        validate_metadata(&label, &reference)?;

        stream.label = label;
        stream.reference = reference;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);

        StreamMetadataUpdated {
            id: stream_id,
            sender: stream.sender.clone(),
            label: stream.label.clone(),
            reference: stream.reference.clone(),
        }
        .publish(&env);

        Ok(())
    }

    /// Issue #182: pause accrual for `stream_id`. Payer-only. Idempotent while
    /// the current pause is still inside its [`MAX_PAUSE_SECONDS`] window.
    ///
    /// A stream whose schedule has already ended cannot be paused: there is no
    /// accrual left to freeze, so it returns [`StreamError::StreamCompleted`].
    ///
    /// Issue #299: once a pause has lapsed on its own (see [`MAX_PAUSE_SECONDS`]),
    /// calling `pause` again folds that window into `total_paused` and opens a
    /// fresh one instead of returning early, so the sender can always re-freeze
    /// a running stream deliberately.
    pub fn pause(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }
        stream.sender.require_auth();
        let now = env.ledger().timestamp();
        if now >= stream.end_time {
            return Err(StreamError::StreamCompleted);
        }
        if let Some(paused_at) = stream.paused_at {
            if now.saturating_sub(paused_at) <= MAX_PAUSE_SECONDS {
                return Ok(());
            }
            // The previous window lapsed on its own; fold its full capped
            // length in before starting a new window at `now`.
            stream.total_paused = stream.total_paused.saturating_add(MAX_PAUSE_SECONDS);
        }
        stream.paused_at = Some(now);
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        StreamPaused { id: stream_id, paused_at: now }.publish(&env);
        Ok(())
    }

    /// Issue #182: resume accrual for `stream_id`. Payer-only. Idempotent while
    /// the stream is not paused.
    ///
    /// Issue #299: a pause lapses on its own after [`MAX_PAUSE_SECONDS`], so a
    /// `resume` that arrives later than that has nothing left to resume and
    /// returns [`StreamError::PauseWindowExceeded`]. The stream itself is not
    /// left frozen: `vested`, `unvested`, `preview_withdraw` and `withdraw` all
    /// treat a lapsed pause as over without another call.
    pub fn resume(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let key = DataKey::Stream(stream_id);
        let mut stream: Stream =
            env.storage().persistent().get(&key).ok_or(StreamError::StreamNotFound)?;
        if stream.cancelled {
            return Err(StreamError::AlreadyCancelled);
        }
        stream.sender.require_auth();
        let Some(paused_at) = stream.paused_at else {
            return Ok(());
        };
        let now = env.ledger().timestamp();
        let paused_duration = now.saturating_sub(paused_at);
        if paused_duration > MAX_PAUSE_SECONDS {
            return Err(StreamError::PauseWindowExceeded);
        }
        stream.total_paused = stream.total_paused.saturating_add(paused_duration);
        stream.paused_at = None;
        env.storage().persistent().set(&key, &stream);
        env.storage().persistent().extend_ttl(&key, LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        env.storage().instance().extend_ttl(LEDGER_BUMP_THRESHOLD, LEDGER_BUMP_LIMIT);
        StreamResumed { id: stream_id, resumed_at: now, total_paused: stream.total_paused }
            .publish(&env);
        Ok(())
    }
    /// The contract interface version, shared by every contract in the
    /// workspace.
    pub fn version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }

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
    /// Issue #83.
    pub fn vesting_summary(env: Env, stream_id: u64) -> Result<VestingSummary, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        let vested = vested_amount(&stream, env.ledger().timestamp());
        Ok(VestingSummary { vested, claimable: (vested - stream.withdrawn).max(0) })
    }

    /// View the part of the stream's total that has not vested yet:
    /// `total_amount - vested`, clamped at zero. Issue #296.
    ///
    /// Clients that display a "remaining" figure used to subtract `vested` from
    /// `total_amount` themselves, which could drift from the pause accounting
    /// that `vested` already applies. This view reuses the same vesting helper,
    /// so the two numbers can never disagree and the result is never negative —
    /// including after a full withdrawal and on a stream that has ended.
    pub fn unvested(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        let vested = vested_amount(&stream, env.ledger().timestamp());
        Ok((stream.total_amount - vested).max(0))
    }

    /// Preview what [`StreamContract::withdraw`] would pay right now: the gross
    /// claimable amount, the protocol fee and the net the recipient would
    /// receive. Issue #300.
    ///
    /// The split comes from the same helper `withdraw` uses, so the preview
    /// cannot drift from the payout or from the treasury lookup. When nothing is
    /// claimable it returns `{ gross: 0, fee: 0, net: 0 }` instead of
    /// [`StreamError::NothingToWithdraw`], which lets a client poll it like any
    /// other view. A stream that is inside an active pause reports
    /// [`StreamError::StreamPaused`], exactly what `withdraw` would answer, since
    /// the preview describes a call that would be rejected.
    pub fn preview_withdraw(env: Env, stream_id: u64) -> Result<WithdrawPreview, StreamError> {
        let stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::StreamNotFound)?;
        let now = env.ledger().timestamp();
        if is_actively_paused(&stream, now) {
            return Err(StreamError::StreamPaused);
        }
        let claimable = (vested_amount(&stream, now) - stream.withdrawn).max(0);
        if claimable == 0 {
            return Ok(WithdrawPreview { gross: 0, fee: 0, net: 0 });
        }
        let split = withdraw_split(&env, claimable)?;
        Ok(WithdrawPreview { gross: claimable, fee: split.fee, net: split.net })
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
    env: &Env,
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
    if start_time < env.ledger().timestamp() {
        return Err(StreamError::InvalidStartTime);
    }
    if end_time <= start_time {
        return Err(StreamError::InvalidTimeRange);
    }
    if cliff_time < start_time || cliff_time > end_time {
        return Err(StreamError::InvalidCliff);
    }
    validate_metadata(label, reference)?;
    Ok(())
}

/// Checks the metadata caps shared by [`StreamContract::create_stream`],
/// [`StreamContract::create_streams`] and [`StreamContract::set_metadata`], so
/// the three entry points cannot drift apart.
fn validate_metadata(label: &String, reference: &String) -> Result<(), StreamError> {
    if label.len() > MAX_LABEL_LEN || reference.len() > MAX_REFERENCE_LEN {
        return Err(StreamError::MetadataTooLong);
    }
    Ok(())
}

/// Linearly vested amount of a stream at a given timestamp.
pub(crate) fn vested_amount(stream: &Stream, now: u64) -> i128 {
    if now < stream.start_time || now < stream.cliff_time {
        return 0;
    }
    let capped_now = if now > stream.end_time { stream.end_time } else { now };
    let elapsed_secs = capped_now.saturating_sub(stream.start_time);
    // Issue #299: a pause suppresses accrual for at most `MAX_PAUSE_SECONDS`.
    // Past that the stream runs again by itself, so the recipient is never
    // locked out past the cap no matter what the sender does.
    let active_pause_secs = match stream.paused_at {
        Some(p) if now > p => {
            let paused_so_far = now.min(stream.end_time).saturating_sub(p);
            paused_so_far.min(MAX_PAUSE_SECONDS)
        }
        _ => 0,
    };
    let effective_elapsed =
        elapsed_secs.saturating_sub(stream.total_paused).saturating_sub(active_pause_secs);
    let duration = stream.end_time - stream.start_time;
    if duration == 0 {
        return stream.total_amount;
    }
    let vested = stream.total_amount * i128::from(effective_elapsed) / i128::from(duration);
    if vested > stream.total_amount {
        stream.total_amount
    } else {
        vested
    }
}

fn next_id(env: &Env) -> u64 {
    let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
    env.storage().instance().set(&DataKey::NextId, &(id + 1));
    id
}

/// Whether `stream` is inside a pause window that has not lapsed yet.
///
/// Issue #299: `paused_at` alone is not enough. Once `MAX_PAUSE_SECONDS` have
/// elapsed the pause is over for every purpose even though the field is still
/// set, because a lapse cannot write storage from a read path.
fn is_actively_paused(stream: &Stream, now: u64) -> bool {
    match stream.paused_at {
        Some(paused_at) => now.saturating_sub(paused_at) <= MAX_PAUSE_SECONDS,
        None => false,
    }
}

/// A gross claimable amount split into the protocol fee, the net paid to the
/// recipient and the treasury that receives the fee.
struct WithdrawSplit {
    fee: i128,
    net: i128,
    treasury: Option<Address>,
}

/// Splits a gross claimable amount the way [`StreamContract::withdraw`] does.
///
/// `withdraw` and [`StreamContract::preview_withdraw`] both call this, so the
/// fee arithmetic, its truncating division and the treasury lookup exist once
/// (issue #300). A zero fee skips the treasury lookup, so an unset treasury only
/// errors when a fee is actually owed.
fn withdraw_split(env: &Env, claimable: i128) -> Result<WithdrawSplit, StreamError> {
    let fee = claimable * fee_bps(env) as i128 / 10_000;
    let net = claimable - fee;
    let treasury = if fee > 0 { Some(treasury(env)?) } else { None };
    Ok(WithdrawSplit { fee, net, treasury })
}

fn fee_bps(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
}

fn treasury(env: &Env) -> Result<Address, StreamError> {
    env.storage().instance().get(&DataKey::Treasury).ok_or(StreamError::TreasuryNotSet)
}

mod test;
