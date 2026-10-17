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

export type DataKey = {tag: "Escrow", values: readonly [u64]};

export const EscrowError = {
  1: {message:"EscrowNotFound"},
  2: {message:"EscrowAlreadyExists"},
  3: {message:"InvalidAmount"},
  4: {message:"UnauthorizedOperation"},
  5: {message:"InvalidStateTransition"},
  6: {message:"DeadlineNotReached"},
  7: {message:"DeadlineExpired"},
  8: {message:"AlreadyFinalized"}
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
   * Create a new escrow agreement. Initial status is Created (unfunded).
   */
  create_escrow: ({id, payer, payee, arbiter, token, amount, deadline}: {id: u64, payer: string, payee: string, arbiter: string, token: string, amount: i128, deadline: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund_escrow transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Refund funds to the payer. Authorized by either the payee or the arbiter.
   */
  refund_escrow: ({id, caller}: {id: u64, caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAQAAAAEAAAAAAAAABkVzY3JvdwAAAAAAAQAAAAY=",
        "AAAABAAAAAAAAAAAAAAAC0VzY3Jvd0Vycm9yAAAAAAgAAAAAAAAADkVzY3Jvd05vdEZvdW5kAAAAAAABAAAAAAAAABNFc2Nyb3dBbHJlYWR5RXhpc3RzAAAAAAIAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAADAAAAAAAAABVVbmF1dGhvcml6ZWRPcGVyYXRpb24AAAAAAAAEAAAAAAAAABZJbnZhbGlkU3RhdGVUcmFuc2l0aW9uAAAAAAAFAAAAAAAAABJEZWFkbGluZU5vdFJlYWNoZWQAAAAAAAYAAAAAAAAAD0RlYWRsaW5lRXhwaXJlZAAAAAAHAAAAAAAAABBBbHJlYWR5RmluYWxpemVkAAAACA==",
        "AAAAAwAAAAAAAAAAAAAADEVzY3Jvd1N0YXR1cwAAAAUAAAAAAAAAB0NyZWF0ZWQAAAAAAAAAAAAAAAAGRnVuZGVkAAAAAAABAAAAAAAAAAhSZWxlYXNlZAAAAAIAAAAAAAAACFJlZnVuZGVkAAAAAwAAAAAAAAAJQ2FuY2VsbGVkAAAAAAAABA==",
        "AAAABQAAACFFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGZ1bmRlZC4AAAAAAAAAAAAADEVzY3Jvd0Z1bmRlZAAAAAIAAAAGZXNjcm93AAAAAAAGZnVuZGVkAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACxFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGFncmVlbWVudCBpcyBjcmVhdGVkLgAAAAAAAAANRXNjcm93Q3JlYXRlZAAAAAAAAAIAAAAGZXNjcm93AAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlZnVuZGVkIHRvIHRoZSBwYXllci4AAAAAAAAAAAAORXNjcm93UmVmdW5kZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVmdW5kZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAADZFbWl0dGVkIHdoZW4gZXNjcm93ZWQgZnVuZHMgYXJlIHJlbGVhc2VkIHRvIHRoZSBwYXllZS4AAAAAAAAAAAAORXNjcm93UmVsZWFzZWQAAAAAAAIAAAAGZXNjcm93AAAAAAAIcmVsZWFzZWQAAAAEAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAAAAAABXBheWVlAAAAAAAAEwAAAAAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAACRFbWl0dGVkIHdoZW4gYW4gZXNjcm93IGlzIGNhbmNlbGxlZC4AAAAAAAAAD0VzY3Jvd0NhbmNlbGxlZAAAAAACAAAABmVzY3JvdwAAAAAACWNhbmNlbGxlZAAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAI=",
        "AAAAAAAAABlHZXQgZXNjcm93IGRldGFpbHMgYnkgSUQuAAAAAAAACmdldF9lc2Nyb3cAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+gAAAfQAAAABkVzY3JvdwAA",
        "AAAAAAAAAFtGdW5kIHRoZSBlc2Nyb3cgYnkgdHJhbnNmZXJyaW5nIHRoZSBzcGVjaWZpZWQgYW1vdW50IG9mIHRva2VucyBmcm9tIHBheWVyIHRvIHRoaXMgY29udHJhY3QuAAAAAAtmdW5kX2VzY3JvdwAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAB9AAAAALRXNjcm93RXJyb3IA",
        "AAAAAAAAAIRDYW5jZWwgdGhlIGVzY3Jvdy4gQ2FuIGJlIGNhbmNlbGxlZCBieSBwYXllciBpbW1lZGlhdGVseSBpZiB1bmZ1bmRlZCAoQ3JlYXRlZCksCm9yIGFmdGVyIHRoZSBkZWFkbGluZSBoYXMgcGFzc2VkIGlmIGZ1bmRlZCAoRnVuZGVkKS4AAAANY2FuY2VsX2VzY3JvdwAAAAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZjYWxsZXIAAAAAABMAAAABAAAD6QAAAAIAAAfQAAAAC0VzY3Jvd0Vycm9yAA==",
        "AAAAAAAAAERDcmVhdGUgYSBuZXcgZXNjcm93IGFncmVlbWVudC4gSW5pdGlhbCBzdGF0dXMgaXMgQ3JlYXRlZCAodW5mdW5kZWQpLgAAAA1jcmVhdGVfZXNjcm93AAAAAAAABwAAAAAAAAACaWQAAAAAAAYAAAAAAAAABXBheWVyAAAAAAAAEwAAAAAAAAAFcGF5ZWUAAAAAAAATAAAAAAAAAAdhcmJpdGVyAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAhkZWFkbGluZQAAAAYAAAABAAAD6QAAAAIAAAfQAAAAC0VzY3Jvd0Vycm9yAA==",
        "AAAAAAAAAElSZWZ1bmQgZnVuZHMgdG8gdGhlIHBheWVyLiBBdXRob3JpemVkIGJ5IGVpdGhlciB0aGUgcGF5ZWUgb3IgdGhlIGFyYml0ZXIuAAAAAAAADXJlZnVuZF9lc2Nyb3cAAAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=",
        "AAAAAAAAAEpSZWxlYXNlIGZ1bmRzIHRvIHRoZSBwYXllZS4gQXV0aG9yaXplZCBieSBlaXRoZXIgdGhlIHBheWVyIG9yIHRoZSBhcmJpdGVyLgAAAAAADnJlbGVhc2VfZXNjcm93AAAAAAACAAAAAAAAAAJpZAAAAAAABgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAQAAA+kAAAACAAAH0AAAAAtFc2Nyb3dFcnJvcgA=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_escrow: this.txFromJSON<Option<Escrow>>,
        fund_escrow: this.txFromJSON<Result<void>>,
        cancel_escrow: this.txFromJSON<Result<void>>,
        create_escrow: this.txFromJSON<Result<void>>,
        refund_escrow: this.txFromJSON<Result<void>>,
        release_escrow: this.txFromJSON<Result<void>>
  }
}