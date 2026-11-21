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
 * A reusable split configuration: a set of recipients with proportional
 * shares. Anyone may pay into it; funds are distributed on the spot according
 * to the shares. The creator may still replace the recipients and shares up to
 * the first distribution, after which the configuration is frozen.
 */
export interface Split {
  creator: string;
  /**
 * Set by the first `distribute`, which makes the configuration immutable.
 */
distributed: boolean;
  id: u64;
  recipients: Array<string>;
  shares: Array<u32>;
  total_shares: u32;
}

export type DataKey = {tag: "Split", values: readonly [u64]} | {tag: "NextId", values: void};

export const SplitError = {
  1: {message:"EmptyRecipients"},
  2: {message:"LengthMismatch"},
  3: {message:"InvalidShares"},
  4: {message:"InvalidAmount"},
  5: {message:"DuplicateRecipient"},
  6: {message:"SplitNotFound"},
  7: {message:"Unauthorized"},
  8: {message:"ShareOverflow"},
  9: {message:"RecipientIndexOutOfBounds"},
  10: {message:"InvalidStateTransition"}
}



export interface Client {
  /**
   * Construct and simulate a version transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The contract interface version, shared by every contract in the
   * workspace.
   */
  version: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Fetch a split by id.
   */
  get_split: ({split_id}: {split_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Split>>>

  /**
   * Construct and simulate a distribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Transfer `amount` of `token` from `from` and distribute it across the
   * split's recipients in proportion to their shares. Any rounding dust is
   * assigned to the final recipient so no funds are stranded.
   */
  distribute: ({split_id, from, token, amount}: {split_id: u64, from: string, token: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_split transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Create a new split. `shares[i]` is the weight of `recipients[i]`.
   */
  create_split: ({creator, recipients, shares}: {creator: string, recipients: Array<string>, shares: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a next_split_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The id that will be assigned to the next split.
   */
  next_split_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a update_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Replace a split's recipients and shares before it has been distributed.
   * 
   * Only the creator may call this, and only while no distribution has
   * happened yet: once funds have been paid out the configuration is frozen,
   * so a later change can never rewrite history. The vectors are validated
   * exactly like [`SplitsContract::create_split`]'s (non-empty, same length,
   * positive shares, no duplicate recipient, no share-sum overflow).
   */
  update_shares: ({split_id, creator, recipients, shares}: {split_id: u64, creator: string, recipients: Array<string>, shares: Array<u32>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a recipient_share transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the amount a recipient would receive for a hypothetical distribution.
   * The final recipient gets the remainder, matching `distribute` exactly.
   */
  recipient_share: ({split_id, index, amount}: {split_id: u64, index: u32, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a preview_distribution transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Return the amount every recipient would receive for a hypothetical
   * distribution, in the same order as `recipients`.
   * 
   * The allocation is computed by the same rule `distribute` uses — integer
   * shares plus the rounding dust assigned to the final recipient — so the
   * returned vector sums to exactly `amount` and matches the transfers a real
   * distribution of that amount would make.
   */
  preview_distribution: ({split_id, amount}: {split_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Array<i128>>>>

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
      new ContractSpec([ "AAAAAQAAAR9BIHJldXNhYmxlIHNwbGl0IGNvbmZpZ3VyYXRpb246IGEgc2V0IG9mIHJlY2lwaWVudHMgd2l0aCBwcm9wb3J0aW9uYWwKc2hhcmVzLiBBbnlvbmUgbWF5IHBheSBpbnRvIGl0OyBmdW5kcyBhcmUgZGlzdHJpYnV0ZWQgb24gdGhlIHNwb3QgYWNjb3JkaW5nCnRvIHRoZSBzaGFyZXMuIFRoZSBjcmVhdG9yIG1heSBzdGlsbCByZXBsYWNlIHRoZSByZWNpcGllbnRzIGFuZCBzaGFyZXMgdXAgdG8KdGhlIGZpcnN0IGRpc3RyaWJ1dGlvbiwgYWZ0ZXIgd2hpY2ggdGhlIGNvbmZpZ3VyYXRpb24gaXMgZnJvemVuLgAAAAAAAAAABVNwbGl0AAAAAAAABgAAAAAAAAAHY3JlYXRvcgAAAAATAAAAR1NldCBieSB0aGUgZmlyc3QgYGRpc3RyaWJ1dGVgLCB3aGljaCBtYWtlcyB0aGUgY29uZmlndXJhdGlvbiBpbW11dGFibGUuAAAAAAtkaXN0cmlidXRlZAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAABnNoYXJlcwAAAAAD6gAAAAQAAAAAAAAADHRvdGFsX3NoYXJlcwAAAAQ=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAABVNwbGl0AAAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAA==",
        "AAAABAAAAAAAAAAAAAAAClNwbGl0RXJyb3IAAAAAAAoAAAAAAAAAD0VtcHR5UmVjaXBpZW50cwAAAAABAAAAAAAAAA5MZW5ndGhNaXNtYXRjaAAAAAAAAgAAAAAAAAANSW52YWxpZFNoYXJlcwAAAAAAAAMAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAEAAAAAAAAABJEdXBsaWNhdGVSZWNpcGllbnQAAAAAAAUAAAAAAAAADVNwbGl0Tm90Rm91bmQAAAAAAAAGAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAHAAAAAAAAAA1TaGFyZU92ZXJmbG93AAAAAAAACAAAAAAAAAAZUmVjaXBpZW50SW5kZXhPdXRPZkJvdW5kcwAAAAAAAAkAAAAAAAAAFkludmFsaWRTdGF0ZVRyYW5zaXRpb24AAAAAAAo=",
        "AAAABQAAAC5FbWl0dGVkIHdoZW4gYSBzcGxpdCBjb25maWd1cmF0aW9uIGlzIGNyZWF0ZWQuAAAAAAAAAAAADFNwbGl0Q3JlYXRlZAAAAAIAAAAGc3BsaXRzAAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAAAAAADHRvdGFsX3NoYXJlcwAAAAQAAAAAAAAAAg==",
        "AAAABQAAAEJFbWl0dGVkIHdoZW4gYSBwYXltZW50IGlzIGRpc3RyaWJ1dGVkIGFjcm9zcyBhIHNwbGl0J3MgcmVjaXBpZW50cy4AAAAAAAAAAAAQU3BsaXREaXN0cmlidXRlZAAAAAIAAAAGc3BsaXRzAAAAAAAHZGlzdHJpYgAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABGZyb20AAAATAAAAAAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAEpUaGUgY29udHJhY3QgaW50ZXJmYWNlIHZlcnNpb24sIHNoYXJlZCBieSBldmVyeSBjb250cmFjdCBpbiB0aGUKd29ya3NwYWNlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAABRGZXRjaCBhIHNwbGl0IGJ5IGlkLgAAAAlnZXRfc3BsaXQAAAAAAAABAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAABAAAD6AAAB9AAAAAFU3BsaXQAAAA=",
        "AAAAAAAAAMZUcmFuc2ZlciBgYW1vdW50YCBvZiBgdG9rZW5gIGZyb20gYGZyb21gIGFuZCBkaXN0cmlidXRlIGl0IGFjcm9zcyB0aGUKc3BsaXQncyByZWNpcGllbnRzIGluIHByb3BvcnRpb24gdG8gdGhlaXIgc2hhcmVzLiBBbnkgcm91bmRpbmcgZHVzdCBpcwphc3NpZ25lZCB0byB0aGUgZmluYWwgcmVjaXBpZW50IHNvIG5vIGZ1bmRzIGFyZSBzdHJhbmRlZC4AAAAAAApkaXN0cmlidXRlAAAAAAAEAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAAAAAAABGZyb20AAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAB9AAAAAKU3BsaXRFcnJvcgAA",
        "AAAAAAAAAEFDcmVhdGUgYSBuZXcgc3BsaXQuIGBzaGFyZXNbaV1gIGlzIHRoZSB3ZWlnaHQgb2YgYHJlY2lwaWVudHNbaV1gLgAAAAAAAAxjcmVhdGVfc3BsaXQAAAADAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAATAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAAEAAAAAQAAA+kAAAAGAAAH0AAAAApTcGxpdEVycm9yAAA=",
        "AAAAAAAAAC9UaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IHNwbGl0LgAAAAANbmV4dF9zcGxpdF9pZAAAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAaVSZXBsYWNlIGEgc3BsaXQncyByZWNpcGllbnRzIGFuZCBzaGFyZXMgYmVmb3JlIGl0IGhhcyBiZWVuIGRpc3RyaWJ1dGVkLgoKT25seSB0aGUgY3JlYXRvciBtYXkgY2FsbCB0aGlzLCBhbmQgb25seSB3aGlsZSBubyBkaXN0cmlidXRpb24gaGFzCmhhcHBlbmVkIHlldDogb25jZSBmdW5kcyBoYXZlIGJlZW4gcGFpZCBvdXQgdGhlIGNvbmZpZ3VyYXRpb24gaXMgZnJvemVuLApzbyBhIGxhdGVyIGNoYW5nZSBjYW4gbmV2ZXIgcmV3cml0ZSBoaXN0b3J5LiBUaGUgdmVjdG9ycyBhcmUgdmFsaWRhdGVkCmV4YWN0bHkgbGlrZSBbYFNwbGl0c0NvbnRyYWN0OjpjcmVhdGVfc3BsaXRgXSdzIChub24tZW1wdHksIHNhbWUgbGVuZ3RoLApwb3NpdGl2ZSBzaGFyZXMsIG5vIGR1cGxpY2F0ZSByZWNpcGllbnQsIG5vIHNoYXJlLXN1bSBvdmVyZmxvdykuAAAAAAAADXVwZGF0ZV9zaGFyZXMAAAAAAAAEAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAKcmVjaXBpZW50cwAAAAAD6gAAABMAAAAAAAAABnNoYXJlcwAAAAAD6gAAAAQAAAABAAAD6QAAAAIAAAfQAAAAClNwbGl0RXJyb3IAAA==",
        "AAAAAAAAAJNSZXR1cm4gdGhlIGFtb3VudCBhIHJlY2lwaWVudCB3b3VsZCByZWNlaXZlIGZvciBhIGh5cG90aGV0aWNhbCBkaXN0cmlidXRpb24uClRoZSBmaW5hbCByZWNpcGllbnQgZ2V0cyB0aGUgcmVtYWluZGVyLCBtYXRjaGluZyBgZGlzdHJpYnV0ZWAgZXhhY3RseS4AAAAAD3JlY2lwaWVudF9zaGFyZQAAAAADAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAAAAAAABWluZGV4AAAAAAAABAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAALAAAH0AAAAApTcGxpdEVycm9yAAA=",
        "AAAAAAAAAXlSZXR1cm4gdGhlIGFtb3VudCBldmVyeSByZWNpcGllbnQgd291bGQgcmVjZWl2ZSBmb3IgYSBoeXBvdGhldGljYWwKZGlzdHJpYnV0aW9uLCBpbiB0aGUgc2FtZSBvcmRlciBhcyBgcmVjaXBpZW50c2AuCgpUaGUgYWxsb2NhdGlvbiBpcyBjb21wdXRlZCBieSB0aGUgc2FtZSBydWxlIGBkaXN0cmlidXRlYCB1c2VzIOKAlCBpbnRlZ2VyCnNoYXJlcyBwbHVzIHRoZSByb3VuZGluZyBkdXN0IGFzc2lnbmVkIHRvIHRoZSBmaW5hbCByZWNpcGllbnQg4oCUIHNvIHRoZQpyZXR1cm5lZCB2ZWN0b3Igc3VtcyB0byBleGFjdGx5IGBhbW91bnRgIGFuZCBtYXRjaGVzIHRoZSB0cmFuc2ZlcnMgYSByZWFsCmRpc3RyaWJ1dGlvbiBvZiB0aGF0IGFtb3VudCB3b3VsZCBtYWtlLgAAAAAAABRwcmV2aWV3X2Rpc3RyaWJ1dGlvbgAAAAIAAAAAAAAACHNwbGl0X2lkAAAABgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAQAAA+kAAAPqAAAACwAAB9AAAAAKU3BsaXRFcnJvcgAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    version: this.txFromJSON<u32>,
        get_split: this.txFromJSON<Option<Split>>,
        distribute: this.txFromJSON<Result<void>>,
        create_split: this.txFromJSON<Result<u64>>,
        next_split_id: this.txFromJSON<u64>,
        update_shares: this.txFromJSON<Result<void>>,
        recipient_share: this.txFromJSON<Result<i128>>,
        preview_distribution: this.txFromJSON<Result<Array<i128>>>
  }
}