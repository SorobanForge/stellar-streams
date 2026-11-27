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





export interface Escrow {
  amount: i128;
  arbiter: string;
  deadline: u64;
  id: u64;
  payee: string;
  payer: string;
  status: EscrowStatus;
  token: string;
}

export type DataKey = {tag: "Escrow", values: readonly [u64]} | {tag: "NextId", values: void} | {tag: "Milestones", values: readonly [u64]} | {tag: "MilestoneReleased", values: readonly [u64]};

export const EscrowError = {
  1: {message:"EscrowNotFound"},
  3: {message:"InvalidAmount"},
  4: {message:"UnauthorizedOperation"},
  5: {message:"InvalidStateTransition"},
  6: {message:"DeadlineNotReached"},
  7: {message:"DeadlineExpired"},
  8: {message:"AlreadyFinalized"},
  9: {message:"InvalidDeadline"},
  10: {message:"MilestoneScheduleNotFound"},
  11: {message:"MilestoneIndexOutOfRange"},
  12: {message:"MilestoneAlreadyReleased"},
  13: {message:"MilestoneScheduleInvalid"}
}

export enum EscrowStatus {
  Created = 0,
  Funded = 1,
  Released = 2,
  Refunded = 3,
  Cancelled = 4,
}








export interface Client {
  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The contract interface version, shared by every contract in the
   * workspace.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Get escrow details by ID.
   */
  get_escrow: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Escrow>>>

  /**
   * Construct and simulate a fund_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fund the escrow by transferring the specified amount of tokens from payer to this contract.
   */
  fund_escrow: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cancel_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel the escrow. Can be cancelled by payer immediately if unfunded (Created),
   * or after the deadline has passed if funded (Funded).
   */
  cancel_escrow: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new escrow agreement. The contract assigns the id — the first
   * escrow is `1` and every successful creation increments the counter — and
   * returns it. Initial status is Created (unfunded).
   */
  create_escrow: ({payer, payee, arbiter, token, amount, deadline}: {payer: string, payee: string, arbiter: string, token: string, amount: i128, deadline: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a refund_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Refund funds to the payer. Authorized by either the payee or the arbiter.
   */
  refund_escrow: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_milestones transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The milestone schedule attached to an escrow, if any.
   */
  get_milestones: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Array<i128>>>>

  /**
   * Construct and simulate a next_escrow_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The id that will be assigned to the next escrow.
   */
  next_escrow_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a release_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release funds to the payee. Authorized by either the payer or the arbiter.
   */
  release_escrow: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_milestones transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Attach a milestone schedule to an unfunded escrow.
   * 
   * `amounts` must contain at least two positive entries and sum to the
   * escrow amount. Only the payer may configure the schedule, and only
   * before the escrow is funded.
   */
  set_milestones: ({id, caller, amounts}: {id: u64, caller: string, amounts: Array<i128>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a remaining_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The amount of the escrow that has not yet been released to the payee.
   * 
   * For a milestone escrow this is the sum of every unreleased milestone, so
   * it reaches zero once the final milestone is released. An escrow without
   * a milestone schedule always reports its full amount. Fails with
   * `MilestoneScheduleNotFound` only when a schedule is attached but its
   * release flags are missing.
   */
  remaining_amount: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a release_milestone transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release a single milestone to the payee.
   * 
   * The payer or arbiter may release milestones while the escrow is funded
   * and the deadline has not passed. A milestone can only be released once;
   * releasing the final milestone marks the escrow as `Released`.
   */
  release_milestone: ({id, milestone_index, caller}: {id: u64, milestone_index: u32, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_milestone_released transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Whether a specific milestone has been released.
   */
  is_milestone_released: ({id, milestone_index}: {id: u64, milestone_index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAABkVzY3JvdwAAAAAACAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAdhcmJpdGVyAAAAABMAAAAAAAAACGRlYWRsaW5lAAAABgAAAAAAAAACaWQAAAAAAAYAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAMRXNjcm93U3RhdHVzAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAEAAAAAAAAABkVzY3JvdwAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAAAAAAEAAAAAAAAACk1pbGVzdG9uZXMAAAAAAAEAAAAGAAAAAQAAAAAAAAARTWlsZXN0b25lUmVsZWFzZWQAAAAAAAABAAAABg==",
        "AAAABAAAAAAAAAAAAAAAC0VzY3Jvd0Vycm9yAAAAAAwAAAAAAAAADkVzY3Jvd05vdEZvdW5kAAAAAAABAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAAAwAAAAAAAAAVVW5hdXRob3JpemVkT3BlcmF0aW9uAAAAAAAABAAAAAAAAAAWSW52YWxpZFN0YXRlVHJhbnNpdGlvbgAAAAAABQAAAAAAAAASRGVhZGxpbmVOb3RSZWFjaGVkAAAAAAAGAAAAAAAAAA9EZWFkbGluZUV4cGlyZWQAAAAABwAAAAAAAAAQQWxyZWFkeUZpbmFsaXplZAAAAAgAAAAAAAAAD0ludmFsaWREZWFkbGluZQAAAAAJAAAAAAAAABlNaWxlc3RvbmVTY2hlZHVsZU5vdEZvdW5kAAAAAAAACgAAAAAAAAAYTWlsZXN0b25lSW5kZXhPdXRPZlJhbmdlAAAACwAAAAAAAAAYTWlsZXN0b25lQWxyZWFkeVJlbGVhc2VkAAAADAAAAAAAAAAYTWlsZXN0b25lU2NoZWR1bGVJbnZhbGlkAAAADQ==",
        "AAAAAwAAAAAAAAAAAAAADEVzY3Jvd1N0YXR1cwAAAAUAAAAAAAAAB0NyZWF0ZWQAAAAAAAAAAAAAAAAGRnVuZGVkAAAAAAABAAAAAAAAAAhSZWxlYXNlZAAAAAIAAAAAAAAACFJlZnVuZGVkAAAAAwAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAABA==",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGZ1bmRlZC4AAAAAAAAAAAAADEVzY3Jvd0Z1bmRlZAAAAAIAAAAGZXNjcm93AAAAAAAGZnVuZGVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACxFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGFncmVlbWVudCBpcyBjcmVhdGVkLgAAAAAAAAANRXNjcm93Q3JlYXRlZAAAAAAAAAIAAAAGZXNjcm93AAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlZnVuZGVkIHRvIHRoZSBwYXllci4AAAAAAAAAAAAORXNjcm93UmVmdW5kZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVmdW5kZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlbGVhc2VkIHRvIHRoZSBwYXllZS4AAAAAAAAAAAAORXNjcm93UmVsZWFzZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVsZWFzZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACRFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGNhbmNlbGxlZC4AAAAAAAAAD0VzY3Jvd0NhbmNlbGxlZAAAAAACAAAABmVzY3JvdwAAAAAACWNhbmNlbGxlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAADRFbWl0dGVkIHdoZW4gb25lIG1pbGVzdG9uZSBpcyByZWxlYXNlZCB0byB0aGUgcGF5ZWUuAAAAAAAAABFNaWxlc3RvbmVSZWxlYXNlZAAAAAAAAAIAAAAGZXNjcm93AAAAAAASbWlsZXN0b25lX3JlbGVhc2VkAAAAAAAFAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADtFbWl0dGVkIHdoZW4gYSBtaWxlc3RvbmUgc2NoZWR1bGUgaXMgYXR0YWNoZWQgdG8gYW4gZXNjcm93LgAAAAAAAAAAFE1pbGVzdG9uZXNDb25maWd1cmVkAAAAAgAAAAZlc2Nyb3cAAAAAABVtaWxlc3RvbmVzX2NvbmZpZ3VyZWQAAAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAEpUaGUgY29udHJhY3QgaW50ZXJmYWNlIHZlcnNpb24sIHNoYXJlZCBieSBldmVyeSBjb250cmFjdCBpbiB0aGUKd29ya3NwYWNlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAABlHZXQgZXNjcm93IGRldGFpbHMgYnkgSUQuAAAAAAAACmdldF9lc2Nyb3cAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+gAAAfQAAAABkVzY3JvdwAA",
        "AAAAAAAAAFtGdW5kIHRoZSBlc2Nyb3cgYnkgdHJhbnNmZXJyaW5nIHRoZSBzcGVjaWZpZWQgYW1vdW50IG9mIHRva2VucyBmcm9tIHBheWVyIHRvIHRoaXMgY29udHJhY3QuAAAAAAtmdW5kX2VzY3JvdwAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAIRDYW5jZWwgdGhlIGVzY3Jvdy4gQ2FuIGJlIGNhbmNlbGxlZCBieSBwYXllciBpbW1lZGlhdGVseSBpZiB1bmZ1bmRlZCAoQ3JlYXRlZCksCm9yIGFmdGVyIHRoZSBkZWFkbGluZSBoYXMgcGFzc2VkIGlmIGZ1bmRlZCAoRnVuZGVkKS4AAAANY2FuY2VsX2VzY3JvdwAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAAC0VzY3Jvd0Vycm9yAA==",
        "AAAAAAAAAMVDcmVhdGUgYSBuZXcgZXNjcm93IGFncmVlbWVudC4gVGhlIGNvbnRyYWN0IGFzc2lnbnMgdGhlIGlkIOKAlCB0aGUgZmlyc3QKZXNjcm93IGlzIGAxYCBhbmQgZXZlcnkgc3VjY2Vzc2Z1bCBjcmVhdGlvbiBpbmNyZW1lbnRzIHRoZSBjb3VudGVyIOKAlCBhbmQKcmV0dXJucyBpdC4gSW5pdGlhbCBzdGF0dXMgaXMgQ3JlYXRlZCAodW5mdW5kZWQpLgAAAAAAAA1jcmVhdGVfZXNjcm93AAAAAAAABgAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAVwYXllZQAAAAAAABMAAAAAAAAAB2FyYml0ZXIAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAPpAAAABgAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAElSZWZ1bmQgZnVuZHMgdG8gdGhlIHBheWVyLiBBdXRob3JpemVkIGJ5IGVpdGhlciB0aGUgcGF5ZWUgb3IgdGhlIGFyYml0ZXIuAAAAAAAADXJlZnVuZF9lc2Nyb3cAAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=",
        "AAAAAAAAADVUaGUgbWlsZXN0b25lIHNjaGVkdWxlIGF0dGFjaGVkIHRvIGFuIGVzY3JvdywgaWYgYW55LgAAAAAAAA5nZXRfbWlsZXN0b25lcwAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6AAAA+oAAAAL",
        "AAAAAAAAADBUaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IGVzY3Jvdy4AAAAObmV4dF9lc2Nyb3dfaWQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAEpSZWxlYXNlIGZ1bmRzIHRvIHRoZSBwYXllZS4gQXV0aG9yaXplZCBieSBlaXRoZXIgdGhlIHBheWVyIG9yIHRoZSBhcmJpdGVyLgAAAAAADnJlbGVhc2VfZXNjcm93AAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=",
        "AAAAAAAAANdBdHRhY2ggYSBtaWxlc3RvbmUgc2NoZWR1bGUgdG8gYW4gdW5mdW5kZWQgZXNjcm93LgoKYGFtb3VudHNgIG11c3QgY29udGFpbiBhdCBsZWFzdCB0d28gcG9zaXRpdmUgZW50cmllcyBhbmQgc3VtIHRvIHRoZQplc2Nyb3cgYW1vdW50LiBPbmx5IHRoZSBwYXllciBtYXkgY29uZmlndXJlIHRoZSBzY2hlZHVsZSwgYW5kIG9ubHkKYmVmb3JlIHRoZSBlc2Nyb3cgaXMgZnVuZGVkLgAAAAAOc2V0X21pbGVzdG9uZXMAAAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAB2Ftb3VudHMAAAAD6gAAAAsAAAABAAAD6QAAAAIAAAfQAAAAC0VzY3Jvd0Vycm9yAA==",
        "AAAAAAAAAXdUaGUgYW1vdW50IG9mIHRoZSBlc2Nyb3cgdGhhdCBoYXMgbm90IHlldCBiZWVuIHJlbGVhc2VkIHRvIHRoZSBwYXllZS4KCkZvciBhIG1pbGVzdG9uZSBlc2Nyb3cgdGhpcyBpcyB0aGUgc3VtIG9mIGV2ZXJ5IHVucmVsZWFzZWQgbWlsZXN0b25lLCBzbwppdCByZWFjaGVzIHplcm8gb25jZSB0aGUgZmluYWwgbWlsZXN0b25lIGlzIHJlbGVhc2VkLiBBbiBlc2Nyb3cgd2l0aG91dAphIG1pbGVzdG9uZSBzY2hlZHVsZSBhbHdheXMgcmVwb3J0cyBpdHMgZnVsbCBhbW91bnQuIEZhaWxzIHdpdGgKYE1pbGVzdG9uZVNjaGVkdWxlTm90Rm91bmRgIG9ubHkgd2hlbiBhIHNjaGVkdWxlIGlzIGF0dGFjaGVkIGJ1dCBpdHMKcmVsZWFzZSBmbGFncyBhcmUgbWlzc2luZy4AAAAAEHJlbWFpbmluZ19hbW91bnQAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAACwAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAPZSZWxlYXNlIGEgc2luZ2xlIG1pbGVzdG9uZSB0byB0aGUgcGF5ZWUuCgpUaGUgcGF5ZXIgb3IgYXJiaXRlciBtYXkgcmVsZWFzZSBtaWxlc3RvbmVzIHdoaWxlIHRoZSBlc2Nyb3cgaXMgZnVuZGVkCmFuZCB0aGUgZGVhZGxpbmUgaGFzIG5vdCBwYXNzZWQuIEEgbWlsZXN0b25lIGNhbiBvbmx5IGJlIHJlbGVhc2VkIG9uY2U7CnJlbGVhc2luZyB0aGUgZmluYWwgbWlsZXN0b25lIG1hcmtzIHRoZSBlc2Nyb3cgYXMgYFJlbGVhc2VkYC4AAAAAABFyZWxlYXNlX21pbGVzdG9uZQAAAAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAA9taWxlc3RvbmVfaW5kZXgAAAAABAAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=",
        "AAAAAAAAAC9XaGV0aGVyIGEgc3BlY2lmaWMgbWlsZXN0b25lIGhhcyBiZWVuIHJlbGVhc2VkLgAAAAAVaXNfbWlsZXN0b25lX3JlbGVhc2VkAAAAAAAAAgAAAAAAAAACaWQAAAAAAAYAAAAAAAAAD21pbGVzdG9uZV9pbmRleAAAAAAEAAAAAQAAAAE=" ]),
      options
    )
  }
  public readonly fromJSON = {
    version: this.txFromJSON<u32>,
        get_escrow: this.txFromJSON<Option<Escrow>>,
        fund_escrow: this.txFromJSON<Result<void>>,
        cancel_escrow: this.txFromJSON<Result<void>>,
        create_escrow: this.txFromJSON<Result<u64>>,
        refund_escrow: this.txFromJSON<Result<void>>,
        get_milestones: this.txFromJSON<Option<Array<i128>>>,
        next_escrow_id: this.txFromJSON<u64>,
        release_escrow: this.txFromJSON<Result<void>>,
        set_milestones: this.txFromJSON<Result<void>>,
        remaining_amount: this.txFromJSON<Result<i128>>,
        release_milestone: this.txFromJSON<Result<void>>,
        is_milestone_released: this.txFromJSON<boolean>
  }
}