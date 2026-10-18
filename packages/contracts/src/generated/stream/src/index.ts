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
  recipient: string;
  reference: string;
  sender: string;
  start_time: u64;
  token: string;
  total_amount: i128;
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
  12: {message:"InvalidStartTime"}
}




export interface Client {
  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel a stream. The sender is refunded the unvested portion immediately,
   * while the recipient keeps the right to withdraw everything already vested.
   */
  cancel: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * Construct and simulate a withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw the currently vested (and not yet withdrawn) amount to the recipient.
   * Returns the net amount transferred after any protocol fee.
   */
  withdraw: ({stream_id}: {stream_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a claimable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * View the amount currently available for the recipient to withdraw.
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
   */
  create_stream: ({sender, recipient, token, amount, start_time, end_time, cliff_time, label, reference}: {sender: string, recipient: string, token: string, amount: i128, start_time: u64, end_time: u64, cliff_time: u64, label: string, reference: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a next_stream_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The id that will be assigned to the next stream.
   */
  next_stream_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

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
        "AAAAAQAAASVBIHNpbmdsZSBsaW5lYXIgcGF5bWVudCBzdHJlYW0uIFRva2VucyBhcmUgbG9ja2VkIGluIHRoZSBjb250cmFjdCBhbmQgdmVzdApjb250aW51b3VzbHkgYmV0d2VlbiBgc3RhcnRfdGltZWAgYW5kIGBlbmRfdGltZWAsIHdpdGggYW4gb3B0aW9uYWwgY2xpZmYuCgpgbGFiZWxgIGFuZCBgcmVmZXJlbmNlYCBhcmUgb3B0aW9uYWwgbWV0YWRhdGE6IHRoZXkgYXJlIHN0b3JlZCBhcyBlbXB0eQpzdHJpbmdzIHdoZW4gdGhlIGNyZWF0b3IgZG9lcyBub3Qgc3VwcGx5IHRoZW0gYW5kIG5ldmVyIGFmZmVjdCB2ZXN0aW5nLgAAAAAAAAAAAAAGU3RyZWFtAAAAAAAMAAAAAAAAAAljYW5jZWxsZWQAAAAAAAABAAAAAAAAAApjbGlmZl90aW1lAAAAAAAGAAAAAAAAAAhlbmRfdGltZQAAAAYAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAACXJlZmVyZW5jZQAAAAAAABAAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAx0b3RhbF9hbW91bnQAAAALAAAAAAAAAAl3aXRoZHJhd24AAAAAAAAL",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAEAAAAAAAAABlN0cmVhbQAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIVHJlYXN1cnkAAAAAAAAAAAAAAAZGZWVCcHMAAA==",
        "AAAABAAAAAAAAAAAAAAAC1N0cmVhbUVycm9yAAAAAAsAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAABAAAAAAAAABBJbnZhbGlkVGltZVJhbmdlAAAAAgAAAAAAAAAMSW52YWxpZENsaWZmAAAAAwAAAAAAAAAOU3RyZWFtTm90Rm91bmQAAAAAAAQAAAAAAAAAEU5vdGhpbmdUb1dpdGhkcmF3AAAAAAAABQAAAAAAAAAMVW5hdXRob3JpemVkAAAABgAAAAAAAAAKSW52YWxpZEZlZQAAAAAABwAAAAAAAAAQQWxyZWFkeUNhbmNlbGxlZAAAAAgAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAACQAAAAAAAAAOVHJlYXN1cnlOb3RTZXQAAAAAAAoAAAAAAAAAD01ldGFkYXRhVG9vTG9uZwAAAAAL",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYSBzdHJlYW0gaXMgY3JlYXRlZC4AAAAAAAAAAAAADVN0cmVhbUNyZWF0ZWQAAAAAAAACAAAABnN0cmVhbQAAAAAAB2NyZWF0ZWQAAAAABgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAACxBbW91bnQgbG9ja2VkLCBpbiB0aGUgdG9rZW4ncyBzbWFsbGVzdCB1bml0LgAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAAQAAAAAAAAAAI=",
        "AAAABQAAAClFbWl0dGVkIHdoZW4gdGhlIHNlbmRlciBjYW5jZWxzIGEgc3RyZWFtLgAAAAAAAAAAAAAPU3RyZWFtQ2FuY2VsbGVkAAAAAAIAAAAGc3RyZWFtAAAAAAAJY2FuY2VsbGVkAAAAAAAAAwAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAZzZW5kZXIAAAAAABMAAAAAAAAAJ1VudmVzdGVkIGFtb3VudCByZWZ1bmRlZCB0byB0aGUgc2VuZGVyLgAAAAAIcmVmdW5kZWQAAAALAAAAAAAAAAI=",
        "AAAABQAAAD9FbWl0dGVkIHdoZW4gdGhlIHJlY2lwaWVudCB3aXRoZHJhd3MgYSBzdHJlYW0ncyB2ZXN0ZWQgYmFsYW5jZS4AAAAAAAAAAA9TdHJlYW1XaXRoZHJhd24AAAAAAgAAAAZzdHJlYW0AAAAAAAl3aXRoZHJhd24AAAAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAAAAAAANUFtb3VudCBzZW50IHRvIHRoZSByZWNpcGllbnQsIGFmdGVyIGFueSBwcm90b2NvbCBmZWUuAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAA2ZlZQAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAJRDYW5jZWwgYSBzdHJlYW0uIFRoZSBzZW5kZXIgaXMgcmVmdW5kZWQgdGhlIHVudmVzdGVkIHBvcnRpb24gaW1tZWRpYXRlbHksCndoaWxlIHRoZSByZWNpcGllbnQga2VlcHMgdGhlIHJpZ2h0IHRvIHdpdGhkcmF3IGV2ZXJ5dGhpbmcgYWxyZWFkeSB2ZXN0ZWQuAAAABmNhbmNlbAAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALU3RyZWFtRXJyb3IA",
        "AAAAAAAAADxWaWV3IHRoZSB0b3RhbCBhbW91bnQgdmVzdGVkIHNvIGZhciAod2l0aGRyYXduICsgY2xhaW1hYmxlKS4AAAAGdmVzdGVkAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAALAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAD9VcGRhdGUgdGhlIHByb3RvY29sIGZlZS4gT25seSBjYWxsYWJsZSBieSB0aGUgY29uZmlndXJlZCBhZG1pbi4AAAAAB3NldF9mZWUAAAAAAQAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAIlXaXRoZHJhdyB0aGUgY3VycmVudGx5IHZlc3RlZCAoYW5kIG5vdCB5ZXQgd2l0aGRyYXduKSBhbW91bnQgdG8gdGhlIHJlY2lwaWVudC4KUmV0dXJucyB0aGUgbmV0IGFtb3VudCB0cmFuc2ZlcnJlZCBhZnRlciBhbnkgcHJvdG9jb2wgZmVlLgAAAAAAAAh3aXRoZHJhdwAAAAEAAAAAAAAACXN0cmVhbV9pZAAAAAAAAAYAAAABAAAD6QAAAAsAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAEJWaWV3IHRoZSBhbW91bnQgY3VycmVudGx5IGF2YWlsYWJsZSBmb3IgdGhlIHJlY2lwaWVudCB0byB3aXRoZHJhdy4AAAAAAAljbGFpbWFibGUAAAAAAAABAAAAAAAAAAlzdHJlYW1faWQAAAAAAAAGAAAAAQAAA+kAAAALAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAENGZXRjaCB0aGUgcHJvdG9jb2wgY29uZmlndXJhdGlvbiAocmV0dXJucyBgTm9uZWAgaWYgdW5pbml0aWFsaXplZCkuAAAAAApnZXRfY29uZmlnAAAAAAAAAAAAAQAAA+gAAAfQAAAABkNvbmZpZwAA",
        "AAAAAAAAABVGZXRjaCBhIHN0cmVhbSBieSBpZC4AAAAAAAAKZ2V0X3N0cmVhbQAAAAAAAQAAAAAAAAAJc3RyZWFtX2lkAAAAAAAABgAAAAEAAAPoAAAH0AAAAAZTdHJlYW0AAA==",
        "AAAAAAAAAEFDb25maWd1cmUgdGhlIHByb3RvY29sIGZlZSBhbmQgdHJlYXN1cnkuIENhbiBvbmx5IGJlIGNhbGxlZCBvbmNlLgAAAAAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAACHRyZWFzdXJ5AAAAEwAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAQAAA+kAAAACAAAH0AAAAAtTdHJlYW1FcnJvcgA=",
        "AAAAAAAAAENVcGRhdGUgdGhlIHRyZWFzdXJ5IGFkZHJlc3MuIE9ubHkgY2FsbGFibGUgYnkgdGhlIGNvbmZpZ3VyZWQgYWRtaW4uAAAAAAxzZXRfdHJlYXN1cnkAAAABAAAAAAAAAAh0cmVhc3VyeQAAABMAAAABAAAD6QAAAAIAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAAWFMb2NrIGBhbW91bnRgIG9mIGB0b2tlbmAgYW5kIGJlZ2luIHN0cmVhbWluZyBpdCBmcm9tIGBzZW5kZXJgIHRvIGByZWNpcGllbnRgLgpSZXR1cm5zIHRoZSBuZXcgc3RyZWFtIGlkLgoKYGxhYmVsYCBhbmQgYHJlZmVyZW5jZWAgY2Fycnkgb3B0aW9uYWwgaHVtYW4tcmVhZGFibGUgbWV0YWRhdGEgKGEgcGF5cm9sbApsYWJlbCwgYW4gaW52b2ljZSBvciBncmFudCBpZCkuIFBhc3MgZW1wdHkgc3RyaW5ncyB0byBvbWl0IHRoZW07IHRoZXkgYXJlCmNhcHBlZCBhdCBbYE1BWF9MQUJFTF9MRU5gXSBhbmQgW2BNQVhfUkVGRVJFTkNFX0xFTmBdIGJ5dGVzIHNvIHRoZSBzdHJlYW0ncwpyZW50IHN0YXlzIHByZWRpY3RhYmxlLgAAAAAAAA1jcmVhdGVfc3RyZWFtAAAAAAAACQAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAKc3RhcnRfdGltZQAAAAAABgAAAAAAAAAIZW5kX3RpbWUAAAAGAAAAAAAAAApjbGlmZl90aW1lAAAAAAAGAAAAAAAAAAVsYWJlbAAAAAAAABAAAAAAAAAACXJlZmVyZW5jZQAAAAAAABAAAAABAAAD6QAAAAYAAAfQAAAAC1N0cmVhbUVycm9yAA==",
        "AAAAAAAAADBUaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IHN0cmVhbS4AAAAObmV4dF9zdHJlYW1faWQAAAAAAAAAAAABAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    cancel: this.txFromJSON<Result<void>>,
        vested: this.txFromJSON<Result<i128>>,
        set_fee: this.txFromJSON<Result<void>>,
        withdraw: this.txFromJSON<Result<i128>>,
        claimable: this.txFromJSON<Result<i128>>,
        get_config: this.txFromJSON<Option<Config>>,
        get_stream: this.txFromJSON<Option<Stream>>,
        initialize: this.txFromJSON<Result<void>>,
        set_treasury: this.txFromJSON<Result<void>>,
        create_stream: this.txFromJSON<Result<u64>>,
        next_stream_id: this.txFromJSON<u64>
  }
}