import { Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { Split, Stream } from '@stellar-starter-kit/types';

/** The network passphrase the fake RPC layer pretends to run on. */
export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Encodes a `C...` contract id by repeating `byte` 32 times. */
export function contractId(byte = 1): string {
  return StrKey.encodeContract(Buffer.alloc(32, byte));
}

/** A stable contract id to use as the stream (or token) contract in tests. */
export const CONTRACT_ID = contractId(1);
/** A second contract id, e.g. for a token that is not the stream contract. */
export const TOKEN_ID = contractId(7);

/** The account fixtures use as sender, and the client's connected wallet. */
export const PUBLIC_KEY = Keypair.random().publicKey();
/** The account fixtures use as the stream recipient / escrow payee. */
export const RECIPIENT = Keypair.random().publicKey();
/** The account fixtures use as the escrow arbiter. */
export const ARBITER = Keypair.random().publicKey();

/** A `Stream` value that satisfies every contract invariant, with overrides. */
export function streamFixture(overrides: Partial<Stream> = {}): Stream {
  return {
    id: '1',
    sender: PUBLIC_KEY,
    recipient: RECIPIENT,
    token: CONTRACT_ID,
    totalAmount: '1000000000',
    withdrawn: '0',
    startTime: 1_000,
    endTime: 2_000,
    cliffTime: 1_500,
    label: '',
    reference: '',
    cancelled: false,
    ...overrides,
  };
}

/** Escrow lifecycle states, mirroring `EscrowStatus` in `contracts/escrow`. */
export type EscrowStatusValue = 'created' | 'funded' | 'released' | 'refunded' | 'cancelled';

/**
 * An escrow as a client reads it: `u64` and `i128` fields are decimal strings
 * because they exceed JavaScript's safe integer range.
 */
export interface EscrowFixture {
  id: string;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: string;
  /** Unix timestamp, in seconds, after which the payer can refund. */
  deadline: number;
  status: EscrowStatusValue;
}

/** An `Escrow` value in the `funded` state, with overrides. */
export function escrowFixture(overrides: Partial<EscrowFixture> = {}): EscrowFixture {
  return {
    id: '1',
    payer: PUBLIC_KEY,
    payee: RECIPIENT,
    arbiter: ARBITER,
    token: CONTRACT_ID,
    amount: '1000000000',
    deadline: 86_400,
    status: 'funded',
    ...overrides,
  };
}

/** A `Split` value whose shares add up to `totalShares`, with overrides. */
export function splitFixture(overrides: Partial<Split> = {}): Split {
  return {
    id: '1',
    creator: PUBLIC_KEY,
    recipients: [RECIPIENT, ARBITER],
    shares: [60, 40],
    totalShares: 100,
    ...overrides,
  };
}

/**
 * Encodes a `Stream` the way the contract's `get_stream` returns it, i.e. the
 * snake_case struct `scValToNative` hands back. Defaults match
 * {@link streamFixture}; overrides are raw contract field names.
 */
export function streamScVal(overrides: Partial<Record<string, unknown>> = {}): xdr.ScVal {
  const value = {
    cancelled: false,
    cliff_time: 1_500n,
    end_time: 2_000n,
    id: 1n,
    label: '',
    recipient: RECIPIENT,
    reference: '',
    sender: PUBLIC_KEY,
    start_time: 1_000n,
    token: CONTRACT_ID,
    total_amount: 1_000_000_000n,
    withdrawn: 0n,
    ...overrides,
  };
  return nativeToScVal(value, {
    type: {
      cancelled: ['symbol'],
      cliff_time: ['symbol', 'u64'],
      end_time: ['symbol', 'u64'],
      id: ['symbol', 'u64'],
      label: ['symbol', 'string'],
      recipient: ['symbol', 'address'],
      reference: ['symbol', 'string'],
      sender: ['symbol', 'address'],
      start_time: ['symbol', 'u64'],
      token: ['symbol', 'address'],
      total_amount: ['symbol', 'i128'],
      withdrawn: ['symbol', 'i128'],
    },
  });
}
