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
 * An immutable, reusable split configuration: a set of recipients with
 * proportional shares. Anyone may pay into it; funds are distributed on the
 * spot according to the shares.
 */
export interface Split {
  creator: string;
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
  8: {message:"ShareOverflow"}
}



export interface Client {
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
      new ContractSpec([ "AAAAAQAAAKxBbiBpbW11dGFibGUsIHJldXNhYmxlIHNwbGl0IGNvbmZpZ3VyYXRpb246IGEgc2V0IG9mIHJlY2lwaWVudHMgd2l0aApwcm9wb3J0aW9uYWwgc2hhcmVzLiBBbnlvbmUgbWF5IHBheSBpbnRvIGl0OyBmdW5kcyBhcmUgZGlzdHJpYnV0ZWQgb24gdGhlCnNwb3QgYWNjb3JkaW5nIHRvIHRoZSBzaGFyZXMuAAAAAAAAAAVTcGxpdAAAAAAAAAUAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAACaWQAAAAAAAYAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAATAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAAEAAAAAAAAAAx0b3RhbF9zaGFyZXMAAAAE",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAABVNwbGl0AAAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAA==",
        "AAAABAAAAAAAAAAAAAAAClNwbGl0RXJyb3IAAAAAAAcAAAAAAAAAD0VtcHR5UmVjaXBpZW50cwAAAAABAAAAAAAAAA5MZW5ndGhNaXNtYXRjaAAAAAAAAgAAAAAAAAANSW52YWxpZFNoYXJlcwAAAAAAAAMAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAEAAAAAAAAABJEdXBsaWNhdGVSZWNpcGllbnQAAAAAAAUAAAAAAAAADVNwbGl0Tm90Rm91bmQAAAAAAAAGAAAAAAAAAAxVbmF1dGhvcml6ZWQAAAAH",
        "AAAABQAAAC5FbWl0dGVkIHdoZW4gYSBzcGxpdCBjb25maWd1cmF0aW9uIGlzIGNyZWF0ZWQuAAAAAAAAAAAADFNwbGl0Q3JlYXRlZAAAAAIAAAAGc3BsaXRzAAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAAAAAADHRvdGFsX3NoYXJlcwAAAAQAAAAAAAAAAg==",
        "AAAABQAAAEJFbWl0dGVkIHdoZW4gYSBwYXltZW50IGlzIGRpc3RyaWJ1dGVkIGFjcm9zcyBhIHNwbGl0J3MgcmVjaXBpZW50cy4AAAAAAAAAAAAQU3BsaXREaXN0cmlidXRlZAAAAAIAAAAGc3BsaXRzAAAAAAAHZGlzdHJpYgAAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABGZyb20AAAATAAAAAAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAABRGZXRjaCBhIHNwbGl0IGJ5IGlkLgAAAAlnZXRfc3BsaXQAAAAAAAABAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAABAAAD6AAAB9AAAAAFU3BsaXQAAAA=",
        "AAAAAAAAAMZUcmFuc2ZlciBgYW1vdW50YCBvZiBgdG9rZW5gIGZyb20gYGZyb21gIGFuZCBkaXN0cmlidXRlIGl0IGFjcm9zcyB0aGUKc3BsaXQncyByZWNpcGllbnRzIGluIHByb3BvcnRpb24gdG8gdGhlaXIgc2hhcmVzLiBBbnkgcm91bmRpbmcgZHVzdCBpcwphc3NpZ25lZCB0byB0aGUgZmluYWwgcmVjaXBpZW50IHNvIG5vIGZ1bmRzIGFyZSBzdHJhbmRlZC4AAAAAAApkaXN0cmlidXRlAAAAAAAEAAAAAAAAAAhzcGxpdF9pZAAAAAYAAAAAAAAABGZyb20AAAATAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAB9AAAAAKU3BsaXRFcnJvcgAA",
        "AAAAAAAAAEFDcmVhdGUgYSBuZXcgc3BsaXQuIGBzaGFyZXNbaV1gIGlzIHRoZSB3ZWlnaHQgb2YgYHJlY2lwaWVudHNbaV1gLgAAAAAAAAxjcmVhdGVfc3BsaXQAAAADAAAAAAAAAAdjcmVhdG9yAAAAABMAAAAAAAAACnJlY2lwaWVudHMAAAAAA+oAAAATAAAAAAAAAAZzaGFyZXMAAAAAA+oAAAAEAAAAAQAAA+kAAAAGAAAH0AAAAApTcGxpdEVycm9yAAA=",
        "AAAAAAAAAC9UaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IHNwbGl0LgAAAAANbmV4dF9zcGxpdF9pZAAAAAAAAAAAAAABAAAABg==" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_split: this.txFromJSON<Option<Split>>,
        distribute: this.txFromJSON<Result<void>>,
        create_split: this.txFromJSON<Result<u64>>,
        next_split_id: this.txFromJSON<u64>
  }
}