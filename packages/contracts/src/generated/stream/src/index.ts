import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





/**
 * Protocol-level configuration, set once at initialization.
 */
export interface Config {
  admin: string;
  fee_bps: u32;
  treasury: string;
}


/**
 * A single linear payment stream. Tokens are locked in the contract and vest
 * continuously between `start_time` and `end_time`, with an optional cliff.
 * 
 * `label` and `reference` are optional metadata: they are stored as empty
 * strings when the creator does not supply them and never affect vesting.
 */
export interface Stream {
  cancelled: boolean;
  cliff_time: u64;
  end_time: u64;
  id: u64;
  label: string;
  /**
 * Issue #182: timestamp at which the stream was last paused (`None` when running).
 */
paused_at: Option<u64>;
  recipient: string;
  reference: string;
  sender: string;
  start_time: u64;
  token: string;
  total_amount: i128;
  /**
 * Issue #182: total seconds the stream has spent paused; subtracted from
 * elapsed time in `vested_amount`.
 */
total_paused: u64;
  withdrawn: i128;
}

export type DataKey = {tag: "Stream", values: readonly [u64]} | {tag: "NextId", values: void} | {tag: "Admin", values: void} | {tag: "Treasury", values: void} | {tag: "FeeBps", values: void};


export const StreamError = {
  1: {message:"InvalidAmount"},
  2: {message:"InvalidTimeRange"},
  3: {message:"InvalidCliff"},
  4: {message:"StreamNotFound"},
  5: {message:"NothingToWithdraw"},
  6: {message:"Unauthorized"},
  7: {message:"InvalidFee"},
  8: {message:"AlreadyCancelled"},
  9: {message:"AlreadyInitialized"},
  10: {message:"TreasuryNotSet"},
  11: {message:"MetadataTooLong"},
  12: {message:"InvalidStartTime"},
  13: {message:"EmptyBatch"},
  14: {message:"BatchTooLarge"},
  15: {message:"BatchOverflow"},
  /**
   * Issue #182: `withdraw` was called while the stream is paused.
   */
  16: {message:"StreamPaused"},
  /**
   * Issue #182: reserved for future strict-idempotency variant.
   */
  17: {message:"NotPaused"},
  /**
   * Issue #181: `top_up` was called after the stream's schedule had ended.
   */
  18: {message:"StreamCompleted"},
  /**
   * Issue #181: `top_up` arithmetic would exceed the supported range.
   */
  19: {message:"AmountOverflow"},
  /**
   * Issue #80: `reduce_stream` was asked for a total below what has vested.
   */
  20: {message:"ReductionBelowVested"},
  /**
   * Issue #80: `reduce_stream` was asked for a total that is not a reduction.
   */
  21: {message:"InvalidReduction"},
  22: {message:"SameRecipient"},
  /**
   * Issue #299: `resume` arrived after the pause had already lapsed on its
   * own (`now - paused_at > MAX_PAUSE_SECONDS`). The stream is not frozen:
   * vesting and `withdraw` have already resumed it.
   */
  23: {message:"PauseWindowExceeded"},
  /**
   * Issue #298: `close_stream` called on an active or unsettled stream.
   */
  24: {message:"InvalidStateTransition"}
}







/**
 * Both vesting numbers of a stream, computed from a single storage read.
 * Issue #83: callers that poll a stream for what is vested *and* what the
 * recipient can take right now used to pay two full reads of the same entry
 * by calling `vested` and `claimable` back to back.
 */
export interface VestingSummary {
  claimable: i128;
  vested: i128;
}


/**
 * What a `withdraw` call would pay right now. Issue #300: clients mirror the
 * fee split off-chain, which let the two drift. `preview_withdraw` returns the
 * numbers the contract itself would use, from the same lookups as `withdraw`.
 */
export interface WithdrawPreview {
  /**
 * Protocol fee that would be sent to the treasury.
 */
fee: i128;
  /**
 * Gross claimable amount before the protocol fee.
 */
gross: i128;
  /**
 * Amount the recipient would actually receive.
 */
net: i128;
}






export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Issue #182: pause accrual for `stream_id`. Payer-only. Idempotent while
   * the current pause is still inside its [`MAX_PAUSE_SECONDS`] window.
   * 
   * A stream whose schedule has already ended cannot be paused: there is no
   * accrual left to freeze, so it returns [`StreamError::StreamCompleted`].
   * 
   * Issue #299: once a pause has lapsed on its own (see [`MAX_PAUSE_SECONDS`]),
   * calling `pause` again folds that window into `total_paused` and opens a
   * fresh one instead of returning early, so the sender can always re-freeze
   * a running stream deliberately.
   */
  pause: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a stream. The sender is refunded the unvested portion immediately,
   * while the recipient keeps the right to withdraw everything already vested.
   */
  cancel: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a resume transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Issue #182: resume accrual for `stream_id`. Payer-only. Idempotent while
   * the stream is not paused.
   * 
   * Issue #299: a pause lapses on its own after [`MAX_PAUSE_SECONDS`], so a
   * `resume` that arrives later than that has nothing left to resume and
   * returns [`StreamError::PauseWindowExceeded`]. The stream itself is not
   * left frozen: `vested`, `unvested`, `preview_withdraw` and `withdraw` all
   * treat a lapsed pause as over without another call.
   */
  resume: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a top_up transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add `amount` to a stream's deposit while preserving its payment rate.
   * 
   * Only the stream's sender (the payer) may top it up, and only while the
   * stream is still streaming: cancelled streams and streams whose schedule
   * has already ended are rejected. The end time is extended by
   * `amount * duration / total_amount`, so tokens that have already vested
   * stay vested and the recipient keeps earning at the same pace.
   */
  top_up: ({stream_id, amount}: {stream_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a vested transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View the total amount vested so far (withdrawn + claimable).
   */
  vested: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a set_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the protocol fee. Only callable by the configured admin.
   */
  set_fee: ({fee_bps}: {fee_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The contract interface version, shared by every contract in the
   * workspace.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a unvested transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View the part of the stream's total that has not vested yet:
   * `total_amount - vested`, clamped at zero. Issue #296.
   * 
   * Clients that display a "remaining" figure used to subtract `vested` from
   * `total_amount` themselves, which could drift from the pause accounting
   * that `vested` already applies. This view reuses the same vesting helper,
   * so the two numbers can never disagree and the result is never negative —
   * including after a full withdrawal and on a stream that has ended.
   */
  unvested: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw the currently vested (and not yet withdrawn) amount to the recipient.
   * Returns the net amount transferred after any protocol fee.
   */
  withdraw: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a claimable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claimable: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a get_config transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch the protocol configuration (returns `None` if uninitialized).
   */
  get_config: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Config>>>

  /**
   * Construct and simulate a get_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a stream by id.
   */
  get_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Stream>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Configure the protocol fee and treasury. Can only be called once.
   */
  initialize: ({admin, treasury, fee_bps}: {admin: string, treasury: string, fee_bps: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_streams transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch multiple streams by their ids in a single call.
   * 
   * Returns entries in the order of the requested `ids`, with `None` for
   * unknown ids. Each entry read bumps its persistent TTL, matching `get_stream`.
   */
  get_streams: ({ids}: {ids: Array<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Array<Option<Stream>>>>

  /**
   * Construct and simulate a withdraw_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw the currently vested (and not yet withdrawn) amount to `destination`.
   * Authorized by the stream recipient.
   * Returns the net amount transferred after any protocol fee.
   */
  withdraw_to: ({stream_id, destination}: {stream_id: u64, destination: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a close_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reclaim persistent storage for a fully settled stream.
   * 
   * Rejects active streams with [`StreamError::InvalidStateTransition`]: only
   * streams that are cancelled or past their schedule end and whose balance has
   * been fully withdrawn (`withdrawn == total_amount`) can be closed.
   * Removing the entry frees rent and makes subsequent reads or calls return
   * [`StreamError::StreamNotFound`].
   */
  close_stream: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_metadata transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace a stream's `label` and `reference`. Only the stream's sender may
   * call it, and only while the stream is not cancelled. Issue #297.
   * 
   * Payroll and grant teams need to attach an invoice id, or correct a typo,
   * after the stream exists. `sender` is an explicit argument rather than an
   * implicit auth of the stored address so that any other signer gets a typed
   * [`StreamError::Unauthorized`] instead of a host auth trap, the same way
   * [`StreamContract::transfer_recipient`] checks its caller.
   * 
   * The same length caps as [`StreamContract::create_stream`] apply, through
   * the same check: over-long input returns [`StreamError::MetadataTooLong`]
   * and leaves the stored metadata untouched. A cancelled stream is rejected
   * with [`StreamError::AlreadyCancelled`] because its schedule has already
   * been compressed and its metadata is part of the settled record. Metadata
   * never affects vesting or balances, and the entry's TTL is bumped so the
   * new values survive as long as the stream does.
   */
  set_metadata: ({stream_id, sender, label, reference}: {stream_id: u64, sender: string, label: string, reference: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Update the treasury address. Only callable by the configured admin.
   */
  set_treasury: ({treasury}: {treasury: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lock `amount` of `token` and begin streaming it from `sender` to `recipient`.
   * Returns the new stream id.
   * 
   * `label` and `reference` carry optional human-readable metadata (a payroll
   * label, an invoice or grant id). Pass empty strings to omit them; they are
   * capped at [`MAX_LABEL_LEN`] and [`MAX_REFERENCE_LEN`] bytes so the stream's
   * rent stays predictable.
   * 
   * `start_time` must not be in the past: it has to be at or after the current
   * ledger timestamp, otherwise [`StreamError::InvalidStartTime`] is returned.
   */
  create_stream: ({sender, recipient, token, amount, start_time, end_time, cliff_time, label, reference}: {sender: string, recipient: string, token: string, amount: i128, start_time: u64, end_time: u64, cliff_time: u64, label: string, reference: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a reduce_stream transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Reduce a stream's total without cancelling it.
   * 
   * Only the stream's sender may reduce it, and the new total must be a
   * positive amount strictly below the current total but at least the amount
   * already vested. The difference is refunded to the sender immediately.
   * 
   * The schedule keeps the stream's current payment rate: `end_time` shrinks
   * by `new_total * duration / total_amount`, so already-vested tokens stay
   * vested and the recipient keeps earning at the same pace until the
   * reduced total runs out. Unlike [`StreamContract::cancel`], the stream is
   * not marked cancelled and its vested balance remains withdrawable.
   */
  reduce_stream: ({stream_id, new_total}: {stream_id: u64, new_total: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_streams transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create many streams from one payroll-style batch in a single call.
   * 
   * `sender` funds every stream and authorizes once for the whole batch: it is
   * [`StreamContract::create_stream`]'s creator/funder (issue #184's `admin`),
   * not the protocol `admin` set by [`StreamContract::initialize`]. `token` is
   * the asset every stream locks.
   * 
   * Each entry is `(recipient, amount, start_time, cliff_time, end_time)`, in
   * the order given by issue #184, so the cliff comes before the end time
   * (unlike `create_stream`). Batch entries carry no metadata: their `label`
   * and `reference` are stored empty.
   * 
   * The call is all-or-nothing: every entry is validated and the deposits are
   * summed with checked arithmetic before any transfer or storage write, so one
   * bad entry moves no tokens and leaves [`StreamContract::next_stream_id`]
   * untouched. Empty batches return [`StreamError::EmptyBatch`], batches over
   * [`MAX_BATCH`] [`StreamError::BatchTooLarge`].
   * 
   * Ids are allocated and returned in input order: `ids[i]` belongs to
   * `entries[i]`.
   */
  create_streams: ({sender, token, entries}: {sender: string, token: string, entries: Array<readonly [string, i128, u64, u64, u64]>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<u64>>>>

  /**
   * Construct and simulate a next_stream_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The id that will be assigned to the next stream.
   */
  next_stream_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a vesting_summary transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View both `vested` and `claimable` from a single storage read. Callers
   * that need the two numbers together avoid reading (and deserializing)
   * the stream entry twice by using this instead of calling both views.
   * Issue #83.
   */
  vesting_summary: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<VestingSummary>>>

  /**
   * Construct and simulate a preview_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Preview what [`StreamContract::withdraw`] would pay right now: the gross
   * claimable amount, the protocol fee and the net the recipient would
   * receive. Issue #300.
   * 
   * The split comes from the same helper `withdraw` uses, so the preview
   * cannot drift from the payout or from the treasury lookup. When nothing is
   * claimable it returns `{ gross: 0, fee: 0, net: 0 }` instead of
   * [`StreamError::NothingToWithdraw`], which lets a client poll it like any
   * other view. A stream that is inside an active pause reports
   * [`StreamError::StreamPaused`], exactly what `withdraw` would answer, since
   * the preview describes a call that would be rejected.
   */
  preview_withdraw: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<WithdrawPreview>>>

  /**
   * Construct and simulate a transfer_recipient transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Hand a stream off to `new_recipient`, e.g. after a key rotation or a sale.
   * 
   * Only the current recipient may call this: `caller` must authorize and
   * match the stored recipient, otherwise the call fails with `Unauthorized`.
   * Amounts already withdrawn stay where they are; everything not yet
   * withdrawn — including a balance that has vested but was never claimed —
   * becomes withdrawable by `new_recipient` only. A recipient who wants to
   * keep the vested part should `withdraw` before transferring.
   */
  transfer_recipient: ({stream_id, caller, new_recipient}: {stream_id: u64, caller: string, new_recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAADlQcm90b2NvbC1sZXZlbCBjb25maWd1cmF0aW9uLCBzZXQgb25jZSBhdCBpbml0aWFsaXphdGlvbi4AAAAAAAAAAAAABkNvbmZpZwAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAdmZWVfYnBzAAAAAAQAAAAAAAAACHRyZWFzdXJ5AAAAEw==",
        "AAAAAQAAASVBIHNpbmdsZSBsaW5lYXIgcGF5bWVudCBzdHJlYW0uIFRva2VucyBhcmUgbG9ja2VkIGluIHRoZSBjb250cmFjdCBhbmQgdmVzdApjb250aW51b3VzbHkgYmV0d2VlbiBgc3RhcnRfdGltZWAgYW5kIGBlbmRfdGltZWAsIHdpdGggYW4gb3B0aW9uYWwgY2xpZmYuCgpgbGFiZWxgIGFuZCBgcmVmZXJlbmNlYCBhcmUgb3B0aW9uYWwgbWV0YWRhdGE6IHRoZXkgYXJlIHN0b3JlZCBhcyBlbXB0eQpzdHJpbmdzIHdoZW4gdGhlIGNyZWF0b3IgZG9lcyBub3Qgc3VwcGx5IHRoZW0gYW5kIG5ldmVyIGFmZmVjdCB2ZXN0aW5nLgAAAAAAAAAAAAAGU3RyZWFtAAAAAAAOAAAAAAAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAAApjbGlmZl90aW1lAAAAAAAGAAAAAAAAAAhlbmRfdGltZQAAAAYAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAVsYWJlbAAAAAAAABAAAABQSXNzdWUgIzE4MjogdGltZXN0YW1wIGF0IHdoaWNoIHRoZSBzdHJlYW0gd2FzIGxhc3QgcGF1c2VkIChgTm9uZWAgd2hlbiBydW5uaW5nKS4AAAAJcGF1c2VkX2F0AAAAAAAD6AAAAAYAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACXJlZmVyZW5jZQAAAAAAABAAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAx0b3RhbF9hbW91bnQAAAALAAAAZ0lzc3VlICMxODI6IHRvdGFsIHNlY29uZHMgdGhlIHN0cmVhbSBoYXMgc3BlbnQgcGF1c2VkOyBzdWJ0cmFjdGVkIGZyb20KZWxhcHNlZCB0aW1lIGluIGB2ZXN0ZWRfYW1vdW50YC4AAAAADHRvdGFsX3BhdXNlZAAAAAYAAAAAAAAACXdpdGhkcmF3bgAAAAAAAAs=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAEAAAAAAAAABlN0cmVhbQAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIVHJlYXN1cnkAAAAAAAAAAAAAAAZGZWVCcHMAAA==",
        "AAAABQAAADBFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGNoYW5nZXMgdGhlIHByb3RvY29sIGZlZS4AAAAAAAAACkZlZVVwZGF0ZWQAAAAAAAIAAAAGc3RyZWFtAAAAAAAHZmVlX3NldAAAAAACAAAAAAAAAAtvbGRfZmVlX2JwcwAAAAAEAAAAAAAAAAAAAAALbmV3X2ZlZV9icHMAAAAABAAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAC1N0cmVhbUVycm9yAAAAABgAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAABAAAAAAAAABBJbnZhbGlkVGltZVJhbmdlAAAAAgAAAAAAAAAMSW52YWxpZENsaWZmAAAAAwAAAAAAAAAOU3RyZWFtTm90Rm91bmQAAAAAAAQAAAAAAAAAEU5vdGhpbmdUb1dpdGhkcmF3AAAAAAAABQAAAAAAAAAMVW5hdXRob3JpemVkAAAABgAAAAAAAAAKSW52YWxpZEZlZQAAAAAABwAAAAAAAAAQQWxyZWFkeUNhbmNlbGxlZAAAAAgAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAACQAAAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAAAoAAAAAAAAAD01ldGFkYXRhVG9vTG9uZwAAAAALAAAAAAAAABBJbnZhbGlkU3RhcnRUaW1lAAAADAAAAAAAAAAKRW1wdHlCYXRjaAAAAAAADQAAAAAAAAANQmF0Y2hUb29MYXJnZQAAAAAAAA4AAAAAAAAADUJhdGNoT3ZlcmZsb3cAAAAAAAAPAAAAPUlzc3VlICMxODI6IGB3aXRoZHJhd2Agd2FzIGNhbGxlZCB3aGlsZSB0aGUgc3RyZWFtIGlzIHBhdXNlZC4AAAAAAAAMU3RyZWFtUGF1c2VkAAAAEAAAADtJc3N1ZSAjMTgyOiByZXNlcnZlZCBmb3IgZnV0dXJlIHN0cmljdC1pZGVtcG90ZW5jeSB2YXJpYW50LgAAAAAJTm90UGF1c2VkAAAAAAAAEQAAAEZJc3N1ZSAjMTgxOiBgdG9wX3VwYCB3YXMgY2FsbGVkIGFmdGVyIHRoZSBzdHJlYW0ncyBzY2hlZHVsZSBoYWQgZW5kZWQuAAAAAAAPU3RyZWFtQ29tcGxldGVkAAAAABIAAABBSXNzdWUgIzE4MTogYHRvcF91cGAgYXJpdGhtZXRpYyB3b3VsZCBleGNlZWQgdGhlIHN1cHBvcnRlZCByYW5nZS4AAAAAAAAOQW1vdW50T3ZlcmZsb3cAAAAAABMAAABHSXNzdWUgIzgwOiBgcmVkdWNlX3N0cmVhbWAgd2FzIGFza2VkIGZvciBhIHRvdGFsIGJlbG93IHdoYXQgaGFzIHZlc3RlZC4AAAAAFFJlZHVjdGlvbkJlbG93VmVzdGVkAAAAFAAAAElJc3N1ZSAjODA6IGByZWR1Y2Vfc3RyZWFtYCB3YXMgYXNrZWQgZm9yIGEgdG90YWwgdGhhdCBpcyBub3QgYSByZWR1Y3Rpb24uAAAAAAAAEEludmFsaWRSZWR1Y3Rpb24AAAAVAAAAAAAAAA1TYW1lUmVjaXBpZW50AAAAAAAAFgAAAL1Jc3N1ZSAjMjk5OiBgcmVzdW1lYCBhcnJpdmVkIGFmdGVyIHRoZSBwYXVzZSBoYWQgYWxyZWFkeSBsYXBzZWQgb24gaXRzCm93biAoYG5vdyAtIHBhdXNlZF9hdCA+IE1BWF9QQVVTRV9TRUNPTkRTYCkuIFRoZSBzdHJlYW0gaXMgbm90IGZyb3plbjoKdmVzdGluZyBhbmQgYHdpdGhkcmF3YCBoYXZlIGFscmVhZHkgcmVzdW1lZCBpdC4AAAAAAAATUGF1c2VXaW5kb3dFeGNlZWRlZAAAAAAXAAAAQ0lzc3VlICMyOTg6IGBjbG9zZV9zdHJlYW1gIGNhbGxlZCBvbiBhbiBhY3RpdmUgb3IgdW5zZXR0bGVkIHN0cmVhbS4AAAAAFkludmFsaWRTdGF0ZVRyYW5zaXRpb24AAAAAABg=",
        "AAAABQAAAEhFbWl0dGVkIHdoZW4gYSBmdWxseSBzZXR0bGVkIHN0cmVhbSBpcyBjbG9zZWQgYW5kIGl0cyBzdG9yYWdlIHJlY2xhaW1lZC4AAAAAAAAADFN0cmVhbUNsb3NlZAAAAAIAAAAGc3RyZWFtAAAAAAAGY2xvc2VkAAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADFN0cmVhbVBhdXNlZAAAAAEAAAANc3RyZWFtX3BhdXNlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAJcGF1c2VkX2F0AAAAAAAABgAAAAAAAAAC",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYSBzdHJlYW0gaXMgY3JlYXRlZC4AAAAAAAAAAAAADVN0cmVhbUNyZWF0ZWQAAAAAAAACAAAABnN0cmVhbQAAAAAAB2NyZWF0ZWQAAAAABgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAACxBbW91bnQgbG9ja2VkLCBpbiB0aGUgdG9rZW4ncyBzbWFsbGVzdCB1bml0LgAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAAQAAAAAAAAAAI=",
        "AAAABQAAAEdFbWl0dGVkIHdoZW4gdGhlIHNlbmRlciByZWR1Y2VzIGEgc3RyZWFtJ3MgdG90YWwgd2l0aG91dCBjYW5jZWxsaW5nIGl0LgAAAAAAAAAADVN0cmVhbVJlZHVjZWQAAAAAAAACAAAABnN0cmVhbQAAAAAAB3JlZHVjZWQAAAAABAAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAANVRoZSBzdHJlYW0ncyBuZXcgdG90YWwsIGluIHRoZSB0b2tlbidzIHNtYWxsZXN0IHVuaXQuAAAAAAAACW5ld190b3RhbAAAAAAAAAsAAAAAAAAAJlRoZSBkaWZmZXJlbmNlIHJlZnVuZGVkIHRvIHRoZSBzZW5kZXIuAAAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADVN0cmVhbVJlc3VtZWQAAAAAAAABAAAADnN0cmVhbV9yZXN1bWVkAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACnJlc3VtZWRfYXQAAAAAAAYAAAAAAAAAAAAAAAx0b3RhbF9wYXVzZWQAAAAGAAAAAAAAAAI=",
        "AAAAAQAAAQpCb3RoIHZlc3RpbmcgbnVtYmVycyBvZiBhIHN0cmVhbSwgY29tcHV0ZWQgZnJvbSBhIHNpbmdsZSBzdG9yYWdlIHJlYWQuCklzc3VlICM4MzogY2FsbGVycyB0aGF0IHBvbGwgYSBzdHJlYW0gZm9yIHdoYXQgaXMgdmVzdGVkICphbmQqIHdoYXQgdGhlCnJlY2lwaWVudCBjYW4gdGFrZSByaWdodCBub3cgdXNlZCB0byBwYXkgdHdvIGZ1bGwgcmVhZHMgb2YgdGhlIHNhbWUgZW50cnkKYnkgY2FsbGluZyBgdmVzdGVkYCBhbmQgYGNsYWltYWJsZWAgYmFjayB0byBiYWNrLgAAAAAAAAAAAA5WZXN0aW5nU3VtbWFyeQAAAAAAAgAAAAAAAAAJY2xhaW1hYmxlAAAAAAAACwAAAAAAAAAGdmVzdGVkAAAAAAAL",
        "AAAAAQAAAONXaGF0IGEgYHdpdGhkcmF3YCBjYWxsIHdvdWxkIHBheSByaWdodCBub3cuIElzc3VlICMzMDA6IGNsaWVudHMgbWlycm9yIHRoZQpmZWUgc3BsaXQgb2ZmLWNoYWluLCB3aGljaCBsZXQgdGhlIHR3byBkcmlmdC4gYHByZXZpZXdfd2l0aGRyYXdgIHJldHVybnMgdGhlCm51bWJlcnMgdGhlIGNvbnRyYWN0IGl0c2VsZiB3b3VsZCB1c2UsIGZyb20gdGhlIHNhbWUgbG9va3VwcyBhcyBgd2l0aGRyYXdgLgAAAAAAAAAAD1dpdGhkcmF3UHJldmlldwAAAAADAAAAMFByb3RvY29sIGZlZSB0aGF0IHdvdWxkIGJlIHNlbnQgdG8gdGhlIHRyZWFzdXJ5LgAAAANmZWUAAAAACwAAAC9Hcm9zcyBjbGFpbWFibGUgYW1vdW50IGJlZm9yZSB0aGUgcHJvdG9jb2wgZmVlLgAAAAAFZ3Jvc3MAAAAAAAALAAAALEFtb3VudCB0aGUgcmVjaXBpZW50IHdvdWxkIGFjdHVhbGx5IHJlY2VpdmUuAAAAA25ldAAAAAAL",
        "AAAABQAAAClFbWl0dGVkIHdoZW4gdGhlIHNlbmRlciBjYW5jZWxzIGEgc3RyZWFtLgAAAAAAAAAAAAAPU3RyZWFtQ2FuY2VsbGVkAAAAAAIAAAAGc3RyZWFtAAAAAAAJY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAJ1VudmVzdGVkIGFtb3VudCByZWZ1bmRlZCB0byB0aGUgc2VuZGVyLgAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJlY2lwaWVudCB3aXRoZHJhd3MgYSBzdHJlYW0ncyB2ZXN0ZWQgYmFsYW5jZS4AAAAAAAAAAA9TdHJlYW1XaXRoZHJhd24AAAAAAgAAAAZzdHJlYW0AAAAAAAl3aXRoZHJhd24AAAAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAANUFtb3VudCBzZW50IHRvIHRoZSByZWNpcGllbnQsIGFmdGVyIGFueSBwcm90b2NvbCBmZWUuAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAA2ZlZQAAAAALAAAAAAAAAAI=",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGNoYW5nZXMgdGhlIHRyZWFzdXJ5IGFkZHJlc3MuAAAAAAAAAA9UcmVhc3VyeVVwZGF0ZWQAAAAAAgAAAAZzdHJlYW0AAAAAAAh0cmVhc3VyeQAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAC",
        "AAAABQAAAHNFbWl0dGVkIHdoZW4gdGhlIHNlbmRlciByZXBsYWNlcyBhIHN0cmVhbSdzIGxhYmVsIGFuZCByZWZlcmVuY2UuCklzc3VlICMyOTc6IG1ldGFkYXRhIHVzZWQgdG8gYmUgZml4ZWQgYXQgY3JlYXRpb24uAAAAAAAAAAAVU3RyZWFtTWV0YWRhdGFVcGRhdGVkAAAAAAAAAgAAAAZzdHJlYW0AAAAAAAhtZXRhZGF0YQAAAAQAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAAAAAAFbGFiZWwAAAAAAAAQAAAAAAAAAAAAAAAJcmVmZXJlbmNlAAAAAAAAEAAAAAAAAAAC",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJlY2lwaWVudCBoYW5kcyBhIHN0cmVhbSBvZmYgdG8gYSBuZXcgYWRkcmVzcy4AAAAAAAAAABpTdHJlYW1SZWNpcGllbnRUcmFuc2ZlcnJlZAAAAAAAAgAAAAZzdHJlYW0AAAAAAAt0cmFuc2ZlcnJlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAADW9sZF9yZWNpcGllbnQAAAAAAAATAAAAAAAAAAAAAAANbmV3X3JlY2lwaWVudAAAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAAhlJc3N1ZSAjMTgyOiBwYXVzZSBhY2NydWFsIGZvciBgc3RyZWFtX2lkYC4gUGF5ZXItb25seS4gSWRlbXBvdGVudCB3aGlsZQp0aGUgY3VycmVudCBwYXVzZSBpcyBzdGlsbCBpbnNpZGUgaXRzIFtgTUFYX1BBVVNFX1NFQ09ORFNgXSB3aW5kb3cuCgpBIHN0cmVhbSB3aG9zZSBzY2hlZHVsZSBoYXMgYWxyZWFkeSBlbmRlZCBjYW5ub3QgYmUgcGF1c2VkOiB0aGVyZSBpcyBubwphY2NydWFsIGxlZnQgdG8gZnJlZXplLCBzbyBpdCByZXR1cm5zIFtgU3RyZWFtRXJyb3I6OlN0cmVhbUNvbXBsZXRlZGBdLgoKSXNzdWUgIzI5OTogb25jZSBhIHBhdXNlIGhhcyBsYXBzZWQgb24gaXRzIG93biAoc2VlIFtgTUFYX1BBVVNFX1NFQ09ORFNgXSksCmNhbGxpbmcgYHBhdXNlYCBhZ2FpbiBmb2xkcyB0aGF0IHdpbmRvdyBpbnRvIGB0b3RhbF9wYXVzZWRgIGFuZCBvcGVucyBhCmZyZXNoIG9uZSBpbnN0ZWFkIG9mIHJldHVybmluZyBlYXJseSwgc28gdGhlIHNlbmRlciBjYW4gYWx3YXlzIHJlLWZyZWV6ZQphIHJ1bm5pbmcgc3RyZWFtIGRlbGliZXJhdGVseS4AAAAAAAAFcGF1c2UAAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAJRDYW5jZWwgYSBzdHJlYW0uIFRoZSBzZW5kZXIgaXMgcmVmdW5kZWQgdGhlIHVudmVzdGVkIHBvcnRpb24gaW1tZWRpYXRlbHksCndoaWxlIHRoZSByZWNpcGllbnQga2VlcHMgdGhlIHJpZ2h0IHRvIHdpdGhkcmF3IGV2ZXJ5dGhpbmcgYWxyZWFkeSB2ZXN0ZWQuAAAABmNhbmNlbAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAbNJc3N1ZSAjMTgyOiByZXN1bWUgYWNjcnVhbCBmb3IgYHN0cmVhbV9pZGAuIFBheWVyLW9ubHkuIElkZW1wb3RlbnQgd2hpbGUKdGhlIHN0cmVhbSBpcyBub3QgcGF1c2VkLgoKSXNzdWUgIzI5OTogYSBwYXVzZSBsYXBzZXMgb24gaXRzIG93biBhZnRlciBbYE1BWF9QQVVTRV9TRUNPTkRTYF0sIHNvIGEKYHJlc3VtZWAgdGhhdCBhcnJpdmVzIGxhdGVyIHRoYW4gdGhhdCBoYXMgbm90aGluZyBsZWZ0IHRvIHJlc3VtZSBhbmQKcmV0dXJucyBbYFN0cmVhbUVycm9yOjpQYXVzZVdpbmRvd0V4Y2VlZGVkYF0uIFRoZSBzdHJlYW0gaXRzZWxmIGlzIG5vdApsZWZ0IGZyb3plbjogYHZlc3RlZGAsIGB1bnZlc3RlZGAsIGBwcmV2aWV3X3dpdGhkcmF3YCBhbmQgYHdpdGhkcmF3YCBhbGwKdHJlYXQgYSBsYXBzZWQgcGF1c2UgYXMgb3ZlciB3aXRob3V0IGFub3RoZXIgY2FsbC4AAAAABnJlc3VtZQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAZZBZGQgYGFtb3VudGAgdG8gYSBzdHJlYW0ncyBkZXBvc2l0IHdoaWxlIHByZXNlcnZpbmcgaXRzIHBheW1lbnQgcmF0ZS4KCk9ubHkgdGhlIHN0cmVhbSdzIHNlbmRlciAodGhlIHBheWVyKSBtYXkgdG9wIGl0IHVwLCBhbmQgb25seSB3aGlsZSB0aGUKc3RyZWFtIGlzIHN0aWxsIHN0cmVhbWluZzogY2FuY2VsbGVkIHN0cmVhbXMgYW5kIHN0cmVhbXMgd2hvc2Ugc2NoZWR1bGUKaGFzIGFscmVhZHkgZW5kZWQgYXJlIHJlamVjdGVkLiBUaGUgZW5kIHRpbWUgaXMgZXh0ZW5kZWQgYnkKYGFtb3VudCAqIGR1cmF0aW9uIC8gdG90YWxfYW1vdW50YCwgc28gdG9rZW5zIHRoYXQgaGF2ZSBhbHJlYWR5IHZlc3RlZApzdGF5IHZlc3RlZCBhbmQgdGhlIHJlY2lwaWVudCBrZWVwcyBlYXJuaW5nIGF0IHRoZSBzYW1lIHBhY2UuAAAAAAAGdG9wX3VwAAAAAAACAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAADxWaWV3IHRoZSB0b3RhbCBhbW91bnQgdmVzdGVkIHNvIGZhciAod2l0aGRyYXduICsgY2xhaW1hYmxlKS4AAAAGdmVzdGVkAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAALAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAD9VcGRhdGUgdGhlIHByb3RvY29sIGZlZS4gT25seSBjYWxsYWJsZSBieSB0aGUgY29uZmlndXJlZCBhZG1pbi4AAAAAB3NldF9mZWUAAAAAAQAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAEpUaGUgY29udHJhY3QgaW50ZXJmYWNlIHZlcnNpb24sIHNoYXJlZCBieSBldmVyeSBjb250cmFjdCBpbiB0aGUKd29ya3NwYWNlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAAdlWaWV3IHRoZSBwYXJ0IG9mIHRoZSBzdHJlYW0ncyB0b3RhbCB0aGF0IGhhcyBub3QgdmVzdGVkIHlldDoKYHRvdGFsX2Ftb3VudCAtIHZlc3RlZGAsIGNsYW1wZWQgYXQgemVyby4gSXNzdWUgIzI5Ni4KCkNsaWVudHMgdGhhdCBkaXNwbGF5IGEgInJlbWFpbmluZyIgZmlndXJlIHVzZWQgdG8gc3VidHJhY3QgYHZlc3RlZGAgZnJvbQpgdG90YWxfYW1vdW50YCB0aGVtc2VsdmVzLCB3aGljaCBjb3VsZCBkcmlmdCBmcm9tIHRoZSBwYXVzZSBhY2NvdW50aW5nCnRoYXQgYHZlc3RlZGAgYWxyZWFkeSBhcHBsaWVzLiBUaGlzIHZpZXcgcmV1c2VzIHRoZSBzYW1lIHZlc3RpbmcgaGVscGVyLApzbyB0aGUgdHdvIG51bWJlcnMgY2FuIG5ldmVyIGRpc2FncmVlIGFuZCB0aGUgcmVzdWx0IGlzIG5ldmVyIG5lZ2F0aXZlIOKAlAppbmNsdWRpbmcgYWZ0ZXIgYSBmdWxsIHdpdGhkcmF3YWwgYW5kIG9uIGEgc3RyZWFtIHRoYXQgaGFzIGVuZGVkLgAAAAAAAAh1bnZlc3RlZAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAD6QAAAAsAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAIlXaXRoZHJhdyB0aGUgY3VycmVudGx5IHZlc3RlZCAoYW5kIG5vdCB5ZXQgd2l0aGRyYXduKSBhbW91bnQgdG8gdGhlIHJlY2lwaWVudC4KUmV0dXJucyB0aGUgbmV0IGFtb3VudCB0cmFuc2ZlcnJlZCBhZnRlciBhbnkgcHJvdG9jb2wgZmVlLgAAAAAAAAh3aXRoZHJhdwAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAD6QAAAAsAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAAAAAAAJY2xhaW1hYmxlAAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAACwAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAENGZXRjaCB0aGUgcHJvdG9jb2wgY29uZmlndXJhdGlvbiAocmV0dXJucyBgTm9uZWAgaWYgdW5pbml0aWFsaXplZCkuAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAA+gAAAfQAAAABkNvbmZpZwAA",
        "AAAAAAAAABVGZXRjaCBhIHN0cmVhbSBieSBpZC4AAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPoAAAH0AAAAAZTdHJlYW0AAA==",
        "AAAAAAAAAEFDb25maWd1cmUgdGhlIHByb3RvY29sIGZlZSBhbmQgdHJlYXN1cnkuIENhbiBvbmx5IGJlIGNhbGxlZCBvbmNlLgAAAAAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAMlGZXRjaCBtdWx0aXBsZSBzdHJlYW1zIGJ5IHRoZWlyIGlkcyBpbiBhIHNpbmdsZSBjYWxsLgoKUmV0dXJucyBlbnRyaWVzIGluIHRoZSBvcmRlciBvZiB0aGUgcmVxdWVzdGVkIGBpZHNgLCB3aXRoIGBOb25lYCBmb3IKdW5rbm93biBpZHMuIEVhY2ggZW50cnkgcmVhZCBidW1wcyBpdHMgcGVyc2lzdGVudCBUVEwsIG1hdGNoaW5nIGBnZXRfc3RyZWFtYC4AAAAAAAALZ2V0X3N0cmVhbXMAAAAAAQAAAAAAAAADaWRzAAAAA+oAAAAGAAAAAQAAA+oAAAPoAAAH0AAAAAZTdHJlYW0AAA==",
        "AAAAAAAAAK1XaXRoZHJhdyB0aGUgY3VycmVudGx5IHZlc3RlZCAoYW5kIG5vdCB5ZXQgd2l0aGRyYXduKSBhbW91bnQgdG8gYGRlc3RpbmF0aW9uYC4KQXV0aG9yaXplZCBieSB0aGUgc3RyZWFtIHJlY2lwaWVudC4KUmV0dXJucyB0aGUgbmV0IGFtb3VudCB0cmFuc2ZlcnJlZCBhZnRlciBhbnkgcHJvdG9jb2wgZmVlLgAAAAAAAAt3aXRoZHJhd190bwAAAAACAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAtkZXN0aW5hdGlvbgAAAAATAAAAAQAAA+kAAAALAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAXlSZWNsYWltIHBlcnNpc3RlbnQgc3RvcmFnZSBmb3IgYSBmdWxseSBzZXR0bGVkIHN0cmVhbS4KClJlamVjdHMgYWN0aXZlIHN0cmVhbXMgd2l0aCBbYFN0cmVhbUVycm9yOjpJbnZhbGlkU3RhdGVUcmFuc2l0aW9uYF06IG9ubHkKc3RyZWFtcyB0aGF0IGFyZSBjYW5jZWxsZWQgb3IgcGFzdCB0aGVpciBzY2hlZHVsZSBlbmQgYW5kIHdob3NlIGJhbGFuY2UgaGFzCmJlZW4gZnVsbHkgd2l0aGRyYXduIChgd2l0aGRyYXduID09IHRvdGFsX2Ftb3VudGApIGNhbiBiZSBjbG9zZWQuClJlbW92aW5nIHRoZSBlbnRyeSBmcmVlcyByZW50IGFuZCBtYWtlcyBzdWJzZXF1ZW50IHJlYWRzIG9yIGNhbGxzIHJldHVybgpbYFN0cmVhbUVycm9yOjpTdHJlYW1Ob3RGb3VuZGBdLgAAAAAAAAxjbG9zZV9zdHJlYW0AAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAA8xSZXBsYWNlIGEgc3RyZWFtJ3MgYGxhYmVsYCBhbmQgYHJlZmVyZW5jZWAuIE9ubHkgdGhlIHN0cmVhbSdzIHNlbmRlciBtYXkKY2FsbCBpdCwgYW5kIG9ubHkgd2hpbGUgdGhlIHN0cmVhbSBpcyBub3QgY2FuY2VsbGVkLiBJc3N1ZSAjMjk3LgoKUGF5cm9sbCBhbmQgZ3JhbnQgdGVhbXMgbmVlZCB0byBhdHRhY2ggYW4gaW52b2ljZSBpZCwgb3IgY29ycmVjdCBhIHR5cG8sCmFmdGVyIHRoZSBzdHJlYW0gZXhpc3RzLiBgc2VuZGVyYCBpcyBhbiBleHBsaWNpdCBhcmd1bWVudCByYXRoZXIgdGhhbiBhbgppbXBsaWNpdCBhdXRoIG9mIHRoZSBzdG9yZWQgYWRkcmVzcyBzbyB0aGF0IGFueSBvdGhlciBzaWduZXIgZ2V0cyBhIHR5cGVkCltgU3RyZWFtRXJyb3I6OlVuYXV0aG9yaXplZGBdIGluc3RlYWQgb2YgYSBob3N0IGF1dGggdHJhcCwgdGhlIHNhbWUgd2F5CltgU3RyZWFtQ29udHJhY3Q6OnRyYW5zZmVyX3JlY2lwaWVudGBdIGNoZWNrcyBpdHMgY2FsbGVyLgoKVGhlIHNhbWUgbGVuZ3RoIGNhcHMgYXMgW2BTdHJlYW1Db250cmFjdDo6Y3JlYXRlX3N0cmVhbWBdIGFwcGx5LCB0aHJvdWdoCnRoZSBzYW1lIGNoZWNrOiBvdmVyLWxvbmcgaW5wdXQgcmV0dXJucyBbYFN0cmVhbUVycm9yOjpNZXRhZGF0YVRvb0xvbmdgXQphbmQgbGVhdmVzIHRoZSBzdG9yZWQgbWV0YWRhdGEgdW50b3VjaGVkLiBBIGNhbmNlbGxlZCBzdHJlYW0gaXMgcmVqZWN0ZWQKd2l0aCBbYFN0cmVhbUVycm9yOjpBbHJlYWR5Q2FuY2VsbGVkYF0gYmVjYXVzZSBpdHMgc2NoZWR1bGUgaGFzIGFscmVhZHkKYmVlbiBjb21wcmVzc2VkIGFuZCBpdHMgbWV0YWRhdGEgaXMgcGFydCBvZiB0aGUgc2V0dGxlZCByZWNvcmQuIE1ldGFkYXRhCm5ldmVyIGFmZmVjdHMgdmVzdGluZyBvciBiYWxhbmNlcywgYW5kIHRoZSBlbnRyeSdzIFRUTCBpcyBidW1wZWQgc28gdGhlCm5ldyB2YWx1ZXMgc3Vydml2ZSBhcyBsb25nIGFzIHRoZSBzdHJlYW0gZG9lcy4AAAAMc2V0X21ldGFkYXRhAAAABAAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAACXJlZmVyZW5jZQAAAAAAABAAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAENVcGRhdGUgdGhlIHRyZWFzdXJ5IGFkZHJlc3MuIE9ubHkgY2FsbGFibGUgYnkgdGhlIGNvbmZpZ3VyZWQgYWRtaW4uAAAAAAxzZXRfdHJlYXN1cnkAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAfhMb2NrIGBhbW91bnRgIG9mIGB0b2tlbmAgYW5kIGJlZ2luIHN0cmVhbWluZyBpdCBmcm9tIGBzZW5kZXJgIHRvIGByZWNpcGllbnRgLgpSZXR1cm5zIHRoZSBuZXcgc3RyZWFtIGlkLgoKYGxhYmVsYCBhbmQgYHJlZmVyZW5jZWAgY2Fycnkgb3B0aW9uYWwgaHVtYW4tcmVhZGFibGUgbWV0YWRhdGEgKGEgcGF5cm9sbApsYWJlbCwgYW4gaW52b2ljZSBvciBncmFudCBpZCkuIFBhc3MgZW1wdHkgc3RyaW5ncyB0byBvbWl0IHRoZW07IHRoZXkgYXJlCmNhcHBlZCBhdCBbYE1BWF9MQUJFTF9MRU5gXSBhbmQgW2BNQVhfUkVGRVJFTkNFX0xFTmBdIGJ5dGVzIHNvIHRoZSBzdHJlYW0ncwpyZW50IHN0YXlzIHByZWRpY3RhYmxlLgoKYHN0YXJ0X3RpbWVgIG11c3Qgbm90IGJlIGluIHRoZSBwYXN0OiBpdCBoYXMgdG8gYmUgYXQgb3IgYWZ0ZXIgdGhlIGN1cnJlbnQKbGVkZ2VyIHRpbWVzdGFtcCwgb3RoZXJ3aXNlIFtgU3RyZWFtRXJyb3I6OkludmFsaWRTdGFydFRpbWVgXSBpcyByZXR1cm5lZC4AAAANY3JlYXRlX3N0cmVhbQAAAAAAAAkAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAACGVuZF90aW1lAAAABgAAAAAAAAAKY2xpZmZfdGltZQAAAAAABgAAAAAAAAAFbGFiZWwAAAAAAAAQAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAAQAAAAAQAAA+kAAAAGAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAmFSZWR1Y2UgYSBzdHJlYW0ncyB0b3RhbCB3aXRob3V0IGNhbmNlbGxpbmcgaXQuCgpPbmx5IHRoZSBzdHJlYW0ncyBzZW5kZXIgbWF5IHJlZHVjZSBpdCwgYW5kIHRoZSBuZXcgdG90YWwgbXVzdCBiZSBhCnBvc2l0aXZlIGFtb3VudCBzdHJpY3RseSBiZWxvdyB0aGUgY3VycmVudCB0b3RhbCBidXQgYXQgbGVhc3QgdGhlIGFtb3VudAphbHJlYWR5IHZlc3RlZC4gVGhlIGRpZmZlcmVuY2UgaXMgcmVmdW5kZWQgdG8gdGhlIHNlbmRlciBpbW1lZGlhdGVseS4KClRoZSBzY2hlZHVsZSBrZWVwcyB0aGUgc3RyZWFtJ3MgY3VycmVudCBwYXltZW50IHJhdGU6IGBlbmRfdGltZWAgc2hyaW5rcwpieSBgbmV3X3RvdGFsICogZHVyYXRpb24gLyB0b3RhbF9hbW91bnRgLCBzbyBhbHJlYWR5LXZlc3RlZCB0b2tlbnMgc3RheQp2ZXN0ZWQgYW5kIHRoZSByZWNpcGllbnQga2VlcHMgZWFybmluZyBhdCB0aGUgc2FtZSBwYWNlIHVudGlsIHRoZQpyZWR1Y2VkIHRvdGFsIHJ1bnMgb3V0LiBVbmxpa2UgW2BTdHJlYW1Db250cmFjdDo6Y2FuY2VsYF0sIHRoZSBzdHJlYW0gaXMKbm90IG1hcmtlZCBjYW5jZWxsZWQgYW5kIGl0cyB2ZXN0ZWQgYmFsYW5jZSByZW1haW5zIHdpdGhkcmF3YWJsZS4AAAAAAAANcmVkdWNlX3N0cmVhbQAAAAAAAAIAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAAAAAAACW5ld190b3RhbAAAAAAAAAsAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAA+dDcmVhdGUgbWFueSBzdHJlYW1zIGZyb20gb25lIHBheXJvbGwtc3R5bGUgYmF0Y2ggaW4gYSBzaW5nbGUgY2FsbC4KCmBzZW5kZXJgIGZ1bmRzIGV2ZXJ5IHN0cmVhbSBhbmQgYXV0aG9yaXplcyBvbmNlIGZvciB0aGUgd2hvbGUgYmF0Y2g6IGl0IGlzCltgU3RyZWFtQ29udHJhY3Q6OmNyZWF0ZV9zdHJlYW1gXSdzIGNyZWF0b3IvZnVuZGVyIChpc3N1ZSAjMTg0J3MgYGFkbWluYCksCm5vdCB0aGUgcHJvdG9jb2wgYGFkbWluYCBzZXQgYnkgW2BTdHJlYW1Db250cmFjdDo6aW5pdGlhbGl6ZWBdLiBgdG9rZW5gIGlzCnRoZSBhc3NldCBldmVyeSBzdHJlYW0gbG9ja3MuCgpFYWNoIGVudHJ5IGlzIGAocmVjaXBpZW50LCBhbW91bnQsIHN0YXJ0X3RpbWUsIGNsaWZmX3RpbWUsIGVuZF90aW1lKWAsIGluCnRoZSBvcmRlciBnaXZlbiBieSBpc3N1ZSAjMTg0LCBzbyB0aGUgY2xpZmYgY29tZXMgYmVmb3JlIHRoZSBlbmQgdGltZQoodW5saWtlIGBjcmVhdGVfc3RyZWFtYCkuIEJhdGNoIGVudHJpZXMgY2Fycnkgbm8gbWV0YWRhdGE6IHRoZWlyIGBsYWJlbGAKYW5kIGByZWZlcmVuY2VgIGFyZSBzdG9yZWQgZW1wdHkuCgpUaGUgY2FsbCBpcyBhbGwtb3Itbm90aGluZzogZXZlcnkgZW50cnkgaXMgdmFsaWRhdGVkIGFuZCB0aGUgZGVwb3NpdHMgYXJlCnN1bW1lZCB3aXRoIGNoZWNrZWQgYXJpdGhtZXRpYyBiZWZvcmUgYW55IHRyYW5zZmVyIG9yIHN0b3JhZ2Ugd3JpdGUsIHNvIG9uZQpiYWQgZW50cnkgbW92ZXMgbm8gdG9rZW5zIGFuZCBsZWF2ZXMgW2BTdHJlYW1Db250cmFjdDo6bmV4dF9zdHJlYW1faWRgXQp1bnRvdWNoZWQuIEVtcHR5IGJhdGNoZXMgcmV0dXJuIFtgU3RyZWFtRXJyb3I6OkVtcHR5QmF0Y2hgXSwgYmF0Y2hlcyBvdmVyCltgTUFYX0JBVENIYF0gW2BTdHJlYW1FcnJvcjo6QmF0Y2hUb29MYXJnZWBdLgoKSWRzIGFyZSBhbGxvY2F0ZWQgYW5kIHJldHVybmVkIGluIGlucHV0IG9yZGVyOiBgaWRzW2ldYCBiZWxvbmdzIHRvCmBlbnRyaWVzW2ldYC4AAAAADmNyZWF0ZV9zdHJlYW1zAAAAAAADAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHZW50cmllcwAAAAPqAAAD7QAAAAUAAAATAAAACwAAAAYAAAAGAAAABgAAAAEAAAPpAAAD6gAAAAYAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAADBUaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IHN0cmVhbS4AAAAObmV4dF9zdHJlYW1faWQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAANpWaWV3IGJvdGggYHZlc3RlZGAgYW5kIGBjbGFpbWFibGVgIGZyb20gYSBzaW5nbGUgc3RvcmFnZSByZWFkLiBDYWxsZXJzCnRoYXQgbmVlZCB0aGUgdHdvIG51bWJlcnMgdG9nZXRoZXIgYXZvaWQgcmVhZGluZyAoYW5kIGRlc2VyaWFsaXppbmcpCnRoZSBzdHJlYW0gZW50cnkgdHdpY2UgYnkgdXNpbmcgdGhpcyBpbnN0ZWFkIG9mIGNhbGxpbmcgYm90aCB2aWV3cy4KSXNzdWUgIzgzLgAAAAAAD3Zlc3Rpbmdfc3VtbWFyeQAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAfQAAAADlZlc3RpbmdTdW1tYXJ5AAAAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAnRQcmV2aWV3IHdoYXQgW2BTdHJlYW1Db250cmFjdDo6d2l0aGRyYXdgXSB3b3VsZCBwYXkgcmlnaHQgbm93OiB0aGUgZ3Jvc3MKY2xhaW1hYmxlIGFtb3VudCwgdGhlIHByb3RvY29sIGZlZSBhbmQgdGhlIG5ldCB0aGUgcmVjaXBpZW50IHdvdWxkCnJlY2VpdmUuIElzc3VlICMzMDAuCgpUaGUgc3BsaXQgY29tZXMgZnJvbSB0aGUgc2FtZSBoZWxwZXIgYHdpdGhkcmF3YCB1c2VzLCBzbyB0aGUgcHJldmlldwpjYW5ub3QgZHJpZnQgZnJvbSB0aGUgcGF5b3V0IG9yIGZyb20gdGhlIHRyZWFzdXJ5IGxvb2t1cC4gV2hlbiBub3RoaW5nIGlzCmNsYWltYWJsZSBpdCByZXR1cm5zIGB7IGdyb3NzOiAwLCBmZWU6IDAsIG5ldDogMCB9YCBpbnN0ZWFkIG9mCltgU3RyZWFtRXJyb3I6Ok5vdGhpbmdUb1dpdGhkcmF3YF0sIHdoaWNoIGxldHMgYSBjbGllbnQgcG9sbCBpdCBsaWtlIGFueQpvdGhlciB2aWV3LiBBIHN0cmVhbSB0aGF0IGlzIGluc2lkZSBhbiBhY3RpdmUgcGF1c2UgcmVwb3J0cwpbYFN0cmVhbUVycm9yOjpTdHJlYW1QYXVzZWRgXSwgZXhhY3RseSB3aGF0IGB3aXRoZHJhd2Agd291bGQgYW5zd2VyLCBzaW5jZQp0aGUgcHJldmlldyBkZXNjcmliZXMgYSBjYWxsIHRoYXQgd291bGQgYmUgcmVqZWN0ZWQuAAAAEHByZXZpZXdfd2l0aGRyYXcAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAfQAAAAD1dpdGhkcmF3UHJldmlldwAAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAexIYW5kIGEgc3RyZWFtIG9mZiB0byBgbmV3X3JlY2lwaWVudGAsIGUuZy4gYWZ0ZXIgYSBrZXkgcm90YXRpb24gb3IgYSBzYWxlLgoKT25seSB0aGUgY3VycmVudCByZWNpcGllbnQgbWF5IGNhbGwgdGhpczogYGNhbGxlcmAgbXVzdCBhdXRob3JpemUgYW5kCm1hdGNoIHRoZSBzdG9yZWQgcmVjaXBpZW50LCBvdGhlcndpc2UgdGhlIGNhbGwgZmFpbHMgd2l0aCBgVW5hdXRob3JpemVkYC4KQW1vdW50cyBhbHJlYWR5IHdpdGhkcmF3biBzdGF5IHdoZXJlIHRoZXkgYXJlOyBldmVyeXRoaW5nIG5vdCB5ZXQKd2l0aGRyYXduIOKAlCBpbmNsdWRpbmcgYSBiYWxhbmNlIHRoYXQgaGFzIHZlc3RlZCBidXQgd2FzIG5ldmVyIGNsYWltZWQg4oCUCmJlY29tZXMgd2l0aGRyYXdhYmxlIGJ5IGBuZXdfcmVjaXBpZW50YCBvbmx5LiBBIHJlY2lwaWVudCB3aG8gd2FudHMgdG8Ka2VlcCB0aGUgdmVzdGVkIHBhcnQgc2hvdWxkIGB3aXRoZHJhd2AgYmVmb3JlIHRyYW5zZmVycmluZy4AAAASdHJhbnNmZXJfcmVjaXBpZW50AAAAAAADAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAADW5ld19yZWNpcGllbnQAAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    pause: this.txFromJSON<Result<void>>,
        cancel: this.txFromJSON<Result<void>>,
        resume: this.txFromJSON<Result<void>>,
        top_up: this.txFromJSON<Result<void>>,
        vested: this.txFromJSON<Result<i128>>,
        set_fee: this.txFromJSON<Result<void>>,
        version: this.txFromJSON<u32>,
        unvested: this.txFromJSON<Result<i128>>,
        withdraw: this.txFromJSON<Result<i128>>,
        claimable: this.txFromJSON<Result<i128>>,
        get_config: this.txFromJSON<Option<Config>>,
        get_stream: this.txFromJSON<Option<Stream>>,
        initialize: this.txFromJSON<Result<void>>,
        get_streams: this.txFromJSON<Array<Option<Stream>>>,
        withdraw_to: this.txFromJSON<Result<i128>>,
        close_stream: this.txFromJSON<Result<void>>,
        set_metadata: this.txFromJSON<Result<void>>,
        set_treasury: this.txFromJSON<Result<void>>,
        create_stream: this.txFromJSON<Result<u64>>,
        reduce_stream: this.txFromJSON<Result<void>>,
        create_streams: this.txFromJSON<Result<Array<u64>>>,
        next_stream_id: this.txFromJSON<u64>,
        vesting_summary: this.txFromJSON<Result<VestingSummary>>,
        preview_withdraw: this.txFromJSON<Result<WithdrawPreview>>,
        transfer_recipient: this.txFromJSON<Result<void>>
  }
}