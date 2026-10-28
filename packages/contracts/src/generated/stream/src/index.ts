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
   * `transfer_recipient` was asked to hand a stream to its current recipient.
   */
  20: {message:"SameRecipient"}
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





export interface Client {
  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View the amount currently available for the recipient to withdraw.
   * Issue #182: pause accrual for `stream_id`. Payer-only. Idempotent.
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
   * Issue #182: resume accrual for `stream_id`. Payer-only. Idempotent.
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
        "AAAABAAAAAAAAAAAAAAAC1N0cmVhbUVycm9yAAAAABQAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAABAAAAAAAAABBJbnZhbGlkVGltZVJhbmdlAAAAAgAAAAAAAAAMSW52YWxpZENsaWZmAAAAAwAAAAAAAAAOU3RyZWFtTm90Rm91bmQAAAAAAAQAAAAAAAAAEU5vdGhpbmdUb1dpdGhkcmF3AAAAAAAABQAAAAAAAAAMVW5hdXRob3JpemVkAAAABgAAAAAAAAAKSW52YWxpZEZlZQAAAAAABwAAAAAAAAAQQWxyZWFkeUNhbmNlbGxlZAAAAAgAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAACQAAAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAAAoAAAAAAAAAD01ldGFkYXRhVG9vTG9uZwAAAAALAAAAAAAAABBJbnZhbGlkU3RhcnRUaW1lAAAADAAAAAAAAAAKRW1wdHlCYXRjaAAAAAAADQAAAAAAAAANQmF0Y2hUb29MYXJnZQAAAAAAAA4AAAAAAAAADUJhdGNoT3ZlcmZsb3cAAAAAAAAPAAAAPUlzc3VlICMxODI6IGB3aXRoZHJhd2Agd2FzIGNhbGxlZCB3aGlsZSB0aGUgc3RyZWFtIGlzIHBhdXNlZC4AAAAAAAAMU3RyZWFtUGF1c2VkAAAAEAAAADtJc3N1ZSAjMTgyOiByZXNlcnZlZCBmb3IgZnV0dXJlIHN0cmljdC1pZGVtcG90ZW5jeSB2YXJpYW50LgAAAAAJTm90UGF1c2VkAAAAAAAAEQAAAEZJc3N1ZSAjMTgxOiBgdG9wX3VwYCB3YXMgY2FsbGVkIGFmdGVyIHRoZSBzdHJlYW0ncyBzY2hlZHVsZSBoYWQgZW5kZWQuAAAAAAAPU3RyZWFtQ29tcGxldGVkAAAAABIAAABBSXNzdWUgIzE4MTogYHRvcF91cGAgYXJpdGhtZXRpYyB3b3VsZCBleGNlZWQgdGhlIHN1cHBvcnRlZCByYW5nZS4AAAAAAAAOQW1vdW50T3ZlcmZsb3cAAAAAABMAAABJYHRyYW5zZmVyX3JlY2lwaWVudGAgd2FzIGFza2VkIHRvIGhhbmQgYSBzdHJlYW0gdG8gaXRzIGN1cnJlbnQgcmVjaXBpZW50LgAAAAAAAA1TYW1lUmVjaXBpZW50AAAAAAAAFA==",
        "AAAABQAAAAAAAAAAAAAADFN0cmVhbVBhdXNlZAAAAAEAAAANc3RyZWFtX3BhdXNlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAJcGF1c2VkX2F0AAAAAAAABgAAAAAAAAAC",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYSBzdHJlYW0gaXMgY3JlYXRlZC4AAAAAAAAAAAAADVN0cmVhbUNyZWF0ZWQAAAAAAAACAAAABnN0cmVhbQAAAAAAB2NyZWF0ZWQAAAAABgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAACxBbW91bnQgbG9ja2VkLCBpbiB0aGUgdG9rZW4ncyBzbWFsbGVzdCB1bml0LgAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAAQAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADVN0cmVhbVJlc3VtZWQAAAAAAAABAAAADnN0cmVhbV9yZXN1bWVkAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACnJlc3VtZWRfYXQAAAAAAAYAAAAAAAAAAAAAAAx0b3RhbF9wYXVzZWQAAAAGAAAAAAAAAAI=",
        "AAAAAQAAAQpCb3RoIHZlc3RpbmcgbnVtYmVycyBvZiBhIHN0cmVhbSwgY29tcHV0ZWQgZnJvbSBhIHNpbmdsZSBzdG9yYWdlIHJlYWQuCklzc3VlICM4MzogY2FsbGVycyB0aGF0IHBvbGwgYSBzdHJlYW0gZm9yIHdoYXQgaXMgdmVzdGVkICphbmQqIHdoYXQgdGhlCnJlY2lwaWVudCBjYW4gdGFrZSByaWdodCBub3cgdXNlZCB0byBwYXkgdHdvIGZ1bGwgcmVhZHMgb2YgdGhlIHNhbWUgZW50cnkKYnkgY2FsbGluZyBgdmVzdGVkYCBhbmQgYGNsYWltYWJsZWAgYmFjayB0byBiYWNrLgAAAAAAAAAAAA5WZXN0aW5nU3VtbWFyeQAAAAAAAgAAAAAAAAAJY2xhaW1hYmxlAAAAAAAACwAAAAAAAAAGdmVzdGVkAAAAAAAL",
        "AAAABQAAAClFbWl0dGVkIHdoZW4gdGhlIHNlbmRlciBjYW5jZWxzIGEgc3RyZWFtLgAAAAAAAAAAAAAPU3RyZWFtQ2FuY2VsbGVkAAAAAAIAAAAGc3RyZWFtAAAAAAAJY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAJ1VudmVzdGVkIGFtb3VudCByZWZ1bmRlZCB0byB0aGUgc2VuZGVyLgAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJlY2lwaWVudCB3aXRoZHJhd3MgYSBzdHJlYW0ncyB2ZXN0ZWQgYmFsYW5jZS4AAAAAAAAAAA9TdHJlYW1XaXRoZHJhd24AAAAAAgAAAAZzdHJlYW0AAAAAAAl3aXRoZHJhd24AAAAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAANUFtb3VudCBzZW50IHRvIHRoZSByZWNpcGllbnQsIGFmdGVyIGFueSBwcm90b2NvbCBmZWUuAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAA2ZlZQAAAAALAAAAAAAAAAI=",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gdGhlIGFkbWluIGNoYW5nZXMgdGhlIHRyZWFzdXJ5IGFkZHJlc3MuAAAAAAAAAA9UcmVhc3VyeVVwZGF0ZWQAAAAAAgAAAAZzdHJlYW0AAAAAAAh0cmVhc3VyeQAAAAEAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAC",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJlY2lwaWVudCBoYW5kcyBhIHN0cmVhbSBvZmYgdG8gYSBuZXcgYWRkcmVzcy4AAAAAAAAAABpTdHJlYW1SZWNpcGllbnRUcmFuc2ZlcnJlZAAAAAAAAgAAAAZzdHJlYW0AAAAAAAt0cmFuc2ZlcnJlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAADW9sZF9yZWNpcGllbnQAAAAAAAATAAAAAAAAAAAAAAANbmV3X3JlY2lwaWVudAAAAAAAABMAAAAAAAAAAg==",
        "AAAAAAAAAIVWaWV3IHRoZSBhbW91bnQgY3VycmVudGx5IGF2YWlsYWJsZSBmb3IgdGhlIHJlY2lwaWVudCB0byB3aXRoZHJhdy4KSXNzdWUgIzE4MjogcGF1c2UgYWNjcnVhbCBmb3IgYHN0cmVhbV9pZGAuIFBheWVyLW9ubHkuIElkZW1wb3RlbnQuAAAAAAAABXBhdXNlAAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAJRDYW5jZWwgYSBzdHJlYW0uIFRoZSBzZW5kZXIgaXMgcmVmdW5kZWQgdGhlIHVudmVzdGVkIHBvcnRpb24gaW1tZWRpYXRlbHksCndoaWxlIHRoZSByZWNpcGllbnQga2VlcHMgdGhlIHJpZ2h0IHRvIHdpdGhkcmF3IGV2ZXJ5dGhpbmcgYWxyZWFkeSB2ZXN0ZWQuAAAABmNhbmNlbAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAENJc3N1ZSAjMTgyOiByZXN1bWUgYWNjcnVhbCBmb3IgYHN0cmVhbV9pZGAuIFBheWVyLW9ubHkuIElkZW1wb3RlbnQuAAAAAAZyZXN1bWUAAAAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAZZBZGQgYGFtb3VudGAgdG8gYSBzdHJlYW0ncyBkZXBvc2l0IHdoaWxlIHByZXNlcnZpbmcgaXRzIHBheW1lbnQgcmF0ZS4KCk9ubHkgdGhlIHN0cmVhbSdzIHNlbmRlciAodGhlIHBheWVyKSBtYXkgdG9wIGl0IHVwLCBhbmQgb25seSB3aGlsZSB0aGUKc3RyZWFtIGlzIHN0aWxsIHN0cmVhbWluZzogY2FuY2VsbGVkIHN0cmVhbXMgYW5kIHN0cmVhbXMgd2hvc2Ugc2NoZWR1bGUKaGFzIGFscmVhZHkgZW5kZWQgYXJlIHJlamVjdGVkLiBUaGUgZW5kIHRpbWUgaXMgZXh0ZW5kZWQgYnkKYGFtb3VudCAqIGR1cmF0aW9uIC8gdG90YWxfYW1vdW50YCwgc28gdG9rZW5zIHRoYXQgaGF2ZSBhbHJlYWR5IHZlc3RlZApzdGF5IHZlc3RlZCBhbmQgdGhlIHJlY2lwaWVudCBrZWVwcyBlYXJuaW5nIGF0IHRoZSBzYW1lIHBhY2UuAAAAAAAGdG9wX3VwAAAAAAACAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAADxWaWV3IHRoZSB0b3RhbCBhbW91bnQgdmVzdGVkIHNvIGZhciAod2l0aGRyYXduICsgY2xhaW1hYmxlKS4AAAAGdmVzdGVkAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAALAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAD9VcGRhdGUgdGhlIHByb3RvY29sIGZlZS4gT25seSBjYWxsYWJsZSBieSB0aGUgY29uZmlndXJlZCBhZG1pbi4AAAAAB3NldF9mZWUAAAAAAQAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAEpUaGUgY29udHJhY3QgaW50ZXJmYWNlIHZlcnNpb24sIHNoYXJlZCBieSBldmVyeSBjb250cmFjdCBpbiB0aGUKd29ya3NwYWNlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAAIlXaXRoZHJhdyB0aGUgY3VycmVudGx5IHZlc3RlZCAoYW5kIG5vdCB5ZXQgd2l0aGRyYXduKSBhbW91bnQgdG8gdGhlIHJlY2lwaWVudC4KUmV0dXJucyB0aGUgbmV0IGFtb3VudCB0cmFuc2ZlcnJlZCBhZnRlciBhbnkgcHJvdG9jb2wgZmVlLgAAAAAAAAh3aXRoZHJhdwAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAD6QAAAAsAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAAAAAAAJY2xhaW1hYmxlAAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAACwAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAAENGZXRjaCB0aGUgcHJvdG9jb2wgY29uZmlndXJhdGlvbiAocmV0dXJucyBgTm9uZWAgaWYgdW5pbml0aWFsaXplZCkuAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAA+gAAAfQAAAABkNvbmZpZwAA",
        "AAAAAAAAABVGZXRjaCBhIHN0cmVhbSBieSBpZC4AAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPoAAAH0AAAAAZTdHJlYW0AAA==",
        "AAAAAAAAAEFDb25maWd1cmUgdGhlIHByb3RvY29sIGZlZSBhbmQgdHJlYXN1cnkuIENhbiBvbmx5IGJlIGNhbGxlZCBvbmNlLgAAAAAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAENVcGRhdGUgdGhlIHRyZWFzdXJ5IGFkZHJlc3MuIE9ubHkgY2FsbGFibGUgYnkgdGhlIGNvbmZpZ3VyZWQgYWRtaW4uAAAAAAxzZXRfdHJlYXN1cnkAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAfhMb2NrIGBhbW91bnRgIG9mIGB0b2tlbmAgYW5kIGJlZ2luIHN0cmVhbWluZyBpdCBmcm9tIGBzZW5kZXJgIHRvIGByZWNpcGllbnRgLgpSZXR1cm5zIHRoZSBuZXcgc3RyZWFtIGlkLgoKYGxhYmVsYCBhbmQgYHJlZmVyZW5jZWAgY2Fycnkgb3B0aW9uYWwgaHVtYW4tcmVhZGFibGUgbWV0YWRhdGEgKGEgcGF5cm9sbApsYWJlbCwgYW4gaW52b2ljZSBvciBncmFudCBpZCkuIFBhc3MgZW1wdHkgc3RyaW5ncyB0byBvbWl0IHRoZW07IHRoZXkgYXJlCmNhcHBlZCBhdCBbYE1BWF9MQUJFTF9MRU5gXSBhbmQgW2BNQVhfUkVGRVJFTkNFX0xFTmBdIGJ5dGVzIHNvIHRoZSBzdHJlYW0ncwpyZW50IHN0YXlzIHByZWRpY3RhYmxlLgoKYHN0YXJ0X3RpbWVgIG11c3Qgbm90IGJlIGluIHRoZSBwYXN0OiBpdCBoYXMgdG8gYmUgYXQgb3IgYWZ0ZXIgdGhlIGN1cnJlbnQKbGVkZ2VyIHRpbWVzdGFtcCwgb3RoZXJ3aXNlIFtgU3RyZWFtRXJyb3I6OkludmFsaWRTdGFydFRpbWVgXSBpcyByZXR1cm5lZC4AAAANY3JlYXRlX3N0cmVhbQAAAAAAAAkAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACnN0YXJ0X3RpbWUAAAAAAAYAAAAAAAAACGVuZF90aW1lAAAABgAAAAAAAAAKY2xpZmZfdGltZQAAAAAABgAAAAAAAAAFbGFiZWwAAAAAAAAQAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAAQAAAAAQAAA+kAAAAGAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAA+dDcmVhdGUgbWFueSBzdHJlYW1zIGZyb20gb25lIHBheXJvbGwtc3R5bGUgYmF0Y2ggaW4gYSBzaW5nbGUgY2FsbC4KCmBzZW5kZXJgIGZ1bmRzIGV2ZXJ5IHN0cmVhbSBhbmQgYXV0aG9yaXplcyBvbmNlIGZvciB0aGUgd2hvbGUgYmF0Y2g6IGl0IGlzCltgU3RyZWFtQ29udHJhY3Q6OmNyZWF0ZV9zdHJlYW1gXSdzIGNyZWF0b3IvZnVuZGVyIChpc3N1ZSAjMTg0J3MgYGFkbWluYCksCm5vdCB0aGUgcHJvdG9jb2wgYGFkbWluYCBzZXQgYnkgW2BTdHJlYW1Db250cmFjdDo6aW5pdGlhbGl6ZWBdLiBgdG9rZW5gIGlzCnRoZSBhc3NldCBldmVyeSBzdHJlYW0gbG9ja3MuCgpFYWNoIGVudHJ5IGlzIGAocmVjaXBpZW50LCBhbW91bnQsIHN0YXJ0X3RpbWUsIGNsaWZmX3RpbWUsIGVuZF90aW1lKWAsIGluCnRoZSBvcmRlciBnaXZlbiBieSBpc3N1ZSAjMTg0LCBzbyB0aGUgY2xpZmYgY29tZXMgYmVmb3JlIHRoZSBlbmQgdGltZQoodW5saWtlIGBjcmVhdGVfc3RyZWFtYCkuIEJhdGNoIGVudHJpZXMgY2Fycnkgbm8gbWV0YWRhdGE6IHRoZWlyIGBsYWJlbGAKYW5kIGByZWZlcmVuY2VgIGFyZSBzdG9yZWQgZW1wdHkuCgpUaGUgY2FsbCBpcyBhbGwtb3Itbm90aGluZzogZXZlcnkgZW50cnkgaXMgdmFsaWRhdGVkIGFuZCB0aGUgZGVwb3NpdHMgYXJlCnN1bW1lZCB3aXRoIGNoZWNrZWQgYXJpdGhtZXRpYyBiZWZvcmUgYW55IHRyYW5zZmVyIG9yIHN0b3JhZ2Ugd3JpdGUsIHNvIG9uZQpiYWQgZW50cnkgbW92ZXMgbm8gdG9rZW5zIGFuZCBsZWF2ZXMgW2BTdHJlYW1Db250cmFjdDo6bmV4dF9zdHJlYW1faWRgXQp1bnRvdWNoZWQuIEVtcHR5IGJhdGNoZXMgcmV0dXJuIFtgU3RyZWFtRXJyb3I6OkVtcHR5QmF0Y2hgXSwgYmF0Y2hlcyBvdmVyCltgTUFYX0JBVENIYF0gW2BTdHJlYW1FcnJvcjo6QmF0Y2hUb29MYXJnZWBdLgoKSWRzIGFyZSBhbGxvY2F0ZWQgYW5kIHJldHVybmVkIGluIGlucHV0IG9yZGVyOiBgaWRzW2ldYCBiZWxvbmdzIHRvCmBlbnRyaWVzW2ldYC4AAAAADmNyZWF0ZV9zdHJlYW1zAAAAAAADAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAHZW50cmllcwAAAAPqAAAD7QAAAAUAAAATAAAACwAAAAYAAAAGAAAABgAAAAEAAAPpAAAD6gAAAAYAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAADBUaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IHN0cmVhbS4AAAAObmV4dF9zdHJlYW1faWQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAANpWaWV3IGJvdGggYHZlc3RlZGAgYW5kIGBjbGFpbWFibGVgIGZyb20gYSBzaW5nbGUgc3RvcmFnZSByZWFkLiBDYWxsZXJzCnRoYXQgbmVlZCB0aGUgdHdvIG51bWJlcnMgdG9nZXRoZXIgYXZvaWQgcmVhZGluZyAoYW5kIGRlc2VyaWFsaXppbmcpCnRoZSBzdHJlYW0gZW50cnkgdHdpY2UgYnkgdXNpbmcgdGhpcyBpbnN0ZWFkIG9mIGNhbGxpbmcgYm90aCB2aWV3cy4KSXNzdWUgIzgzLgAAAAAAD3Zlc3Rpbmdfc3VtbWFyeQAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAfQAAAADlZlc3RpbmdTdW1tYXJ5AAAAAAfQAAAAC1N0cmVhbUVycm9yAA==",
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
        withdraw: this.txFromJSON<Result<i128>>,
        claimable: this.txFromJSON<Result<i128>>,
        get_config: this.txFromJSON<Option<Config>>,
        get_stream: this.txFromJSON<Option<Stream>>,
        initialize: this.txFromJSON<Result<void>>,
        set_treasury: this.txFromJSON<Result<void>>,
        create_stream: this.txFromJSON<Result<u64>>,
        create_streams: this.txFromJSON<Result<Array<u64>>>,
        next_stream_id: this.txFromJSON<u64>,
        vesting_summary: this.txFromJSON<Result<VestingSummary>>,
        transfer_recipient: this.txFromJSON<Result<void>>
  }
}