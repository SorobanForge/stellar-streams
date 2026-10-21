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

export type DataKey = {tag: "Escrow", values: readonly [u64]} | {tag: "NextId", values: void};

export const EscrowError = {
  1: {message:"EscrowNotFound"},
  3: {message:"InvalidAmount"},
  4: {message:"UnauthorizedOperation"},
  5: {message:"InvalidStateTransition"},
  6: {message:"DeadlineNotReached"},
  7: {message:"DeadlineExpired"},
  8: {message:"AlreadyFinalized"},
  9: {message:"InvalidDeadline"}
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
   * Construct and simulate a next_escrow_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The id that will be assigned to the next escrow.
   */
  next_escrow_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a release_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Release funds to the payee. Authorized by either the payer or the arbiter.
   */
  release_escrow: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAEAAAAAAAAABkVzY3JvdwAAAAAAAQAAAAYAAAAAAAAAAAAAAAZOZXh0SWQAAA==",
        "AAAABAAAAAAAAAAAAAAAC0VzY3Jvd0Vycm9yAAAAAAcAAAAAAAAADkVzY3Jvd05vdEZvdW5kAAAAAAABAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAAAwAAAAAAAAAVVW5hdXRob3JpemVkT3BlcmF0aW9uAAAAAAAABAAAAAAAAAAWSW52YWxpZFN0YXRlVHJhbnNpdGlvbgAAAAAABQAAAAAAAAASRGVhZGxpbmVOb3RSZWFjaGVkAAAAAAAGAAAAAAAAAA9EZWFkbGluZUV4cGlyZWQAAAAABwAAAAAAAAAQQWxyZWFkeUZpbmFsaXplZAAAAAg=",
        "AAAAAwAAAAAAAAAAAAAADEVzY3Jvd1N0YXR1cwAAAAUAAAAAAAAAB0NyZWF0ZWQAAAAAAAAAAAAAAAAGRnVuZGVkAAAAAAABAAAAAAAAAAhSZWxlYXNlZAAAAAIAAAAAAAAACFJlZnVuZGVkAAAAAwAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAABA==",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGZ1bmRlZC4AAAAAAAAAAAAADEVzY3Jvd0Z1bmRlZAAAAAIAAAAGZXNjcm93AAAAAAAGZnVuZGVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACxFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGFncmVlbWVudCBpcyBjcmVhdGVkLgAAAAAAAAANRXNjcm93Q3JlYXRlZAAAAAAAAAIAAAAGZXNjcm93AAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlZnVuZGVkIHRvIHRoZSBwYXllci4AAAAAAAAAAAAORXNjcm93UmVmdW5kZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVmdW5kZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlbGVhc2VkIHRvIHRoZSBwYXllZS4AAAAAAAAAAAAORXNjcm93UmVsZWFzZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVsZWFzZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACRFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGNhbmNlbGxlZC4AAAAAAAAAD0VzY3Jvd0NhbmNlbGxlZAAAAAACAAAABmVzY3JvdwAAAAAACWNhbmNlbGxlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAI=",
        "AAAAAAAAAEpUaGUgY29udHJhY3QgaW50ZXJmYWNlIHZlcnNpb24sIHNoYXJlZCBieSBldmVyeSBjb250cmFjdCBpbiB0aGUKd29ya3NwYWNlLgAAAAAAB3ZlcnNpb24AAAAAAAAAAAEAAAAE",
        "AAAAAAAAABlHZXQgZXNjcm93IGRldGFpbHMgYnkgSUQuAAAAAAAACmdldF9lc2Nyb3cAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+gAAAfQAAAABkVzY3JvdwAA",
        "AAAAAAAAAFtGdW5kIHRoZSBlc2Nyb3cgYnkgdHJhbnNmZXJyaW5nIHRoZSBzcGVjaWZpZWQgYW1vdW50IG9mIHRva2VucyBmcm9tIHBheWVyIHRvIHRoaXMgY29udHJhY3QuAAAAAAtmdW5kX2VzY3JvdwAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAIRDYW5jZWwgdGhlIGVzY3Jvdy4gQ2FuIGJlIGNhbmNlbGxlZCBieSBwYXllciBpbW1lZGlhdGVseSBpZiB1bmZ1bmRlZCAoQ3JlYXRlZCksCm9yIGFmdGVyIHRoZSBkZWFkbGluZSBoYXMgcGFzc2VkIGlmIGZ1bmRlZCAoRnVuZGVkKS4AAAANY2FuY2VsX2VzY3JvdwAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAAC0VzY3Jvd0Vycm9yAA==",
        "AAAAAAAAAMVDcmVhdGUgYSBuZXcgZXNjcm93IGFncmVlbWVudC4gVGhlIGNvbnRyYWN0IGFzc2lnbnMgdGhlIGlkIOKAlCB0aGUgZmlyc3QKZXNjcm93IGlzIGAxYCBhbmQgZXZlcnkgc3VjY2Vzc2Z1bCBjcmVhdGlvbiBpbmNyZW1lbnRzIHRoZSBjb3VudGVyIOKAlCBhbmQKcmV0dXJucyBpdC4gSW5pdGlhbCBzdGF0dXMgaXMgQ3JlYXRlZCAodW5mdW5kZWQpLgAAAAAAAA1jcmVhdGVfZXNjcm93AAAAAAAABgAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAVwYXllZQAAAAAAABMAAAAAAAAAB2FyYml0ZXIAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGRlYWRsaW5lAAAABgAAAAEAAAPpAAAABgAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAElSZWZ1bmQgZnVuZHMgdG8gdGhlIHBheWVyLiBBdXRob3JpemVkIGJ5IGVpdGhlciB0aGUgcGF5ZWUgb3IgdGhlIGFyYml0ZXIuAAAAAAAADXJlZnVuZF9lc2Nyb3cAAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=",
        "AAAAAAAAADBUaGUgaWQgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRvIHRoZSBuZXh0IGVzY3Jvdy4AAAAObmV4dF9lc2Nyb3dfaWQAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAEpSZWxlYXNlIGZ1bmRzIHRvIHRoZSBwYXllZS4gQXV0aG9yaXplZCBieSBlaXRoZXIgdGhlIHBheWVyIG9yIHRoZSBhcmJpdGVyLgAAAAAADnJlbGVhc2VfZXNjcm93AAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=" ]),
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
        next_escrow_id: this.txFromJSON<u64>,
        release_escrow: this.txFromJSON<Result<void>>
  }
}