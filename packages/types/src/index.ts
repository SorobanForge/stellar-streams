import { deriveStreamState, type StreamStatus } from '@stellar-starter-kit/utils';

export type StellarNetwork = 'local' | 'testnet' | 'mainnet';

export interface StellarConfig {
  network: StellarNetwork;
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
}

export interface WalletState {
  connected: boolean;
  address?: string;
  error?: string;
}

/**
 * A payment stream, mirroring the `stream` Soroban contract.
 * `u64` / `i128` fields are carried as decimal strings because they exceed
 * JavaScript's safe integer range.
 */
export interface Stream {
  id: string;
  sender: string;
  recipient: string;
  token: string;
  totalAmount: string;
  withdrawn: string;
  startTime: number;
  endTime: number;
  cliffTime: number;
  /** Optional human-readable metadata; an empty string when none was set. */
  label: string;
  /** Optional external reference (invoice or grant id); empty when none was set. */
  reference: string;
  cancelled: boolean;
}

/** Protocol configuration, mirroring the contract's `Config` struct. */
export interface StreamConfig {
  admin: string;
  treasury: string;
  feeBps: number;
}

/**
 * Inputs for `create_stream`. `token` is any token contract id (C...), and
 * `amount` is a decimal string in that token's smallest unit — scale it by the
 * token's own `decimals()`, which is 7 for XLM and SACs but not for every token.
 */
export interface CreateStreamParams {
  sender: string;
  recipient: string;
  /** Token contract id (C...): the XLM SAC, an issued asset's SAC, or a custom token. */
  token: string;
  amount: string;
  startTime: number;
  endTime: number;
  cliffTime: number;
  /** Short human-readable label. At most 64 bytes; defaults to no label. */
  label?: string;
  /** External reference such as an invoice or grant id. At most 128 bytes. */
  reference?: string;
}

/**
 * Lifecycle status of a stream. Defined next to the shared derivation in
 * `@stellar-starter-kit/utils` and re-exported here so existing imports of
 * `StreamStatus` from this package keep working.
 */
export type { StreamStatus };

/**
 * Derives a human-facing status for a stream at a given timestamp.
 * Back-compat wrapper: status now shares one derivation path with progress in
 * `deriveStreamState`, so this simply delegates to it.
 */
export function getStreamStatus(stream: Stream, now: number): StreamStatus {
  return deriveStreamState(stream, now).status;
}
