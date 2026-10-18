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
export type StreamStatus = 'scheduled' | 'streaming' | 'completed' | 'cancelled';

/** A split configuration, mirroring the `Split` Soroban contract struct. */
export interface SplitConfig {
  admin: string;
  totalShares: number;
}

/** A single split configuration: a set of recipients with proportional shares. */
export interface Split {
  id: string;
  creator: string;
  recipients: string[];
  shares: number[];
  totalShares: number;
}

/** Derives a human-facing status for a stream at a given timestamp. */
export function getStreamStatus(stream: Stream, now: number): StreamStatus {
  return deriveStreamState(stream, now).status;
}

/**
 * The statuses of the escrow contract's `EscrowStatus`, as readable names
 * (the `EscrowClient` maps the contract's numeric discriminants onto these).
 */
export type EscrowStatus = 'created' | 'funded' | 'released' | 'refunded' | 'cancelled';

/**
 * An escrow agreement, mirroring the `escrow` Soroban contract. `u64` / `i128`
 * fields are carried as decimal strings because they exceed JavaScript's safe
 * integer range.
 */
export interface Escrow {
  id: string;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: string;
  deadline: number;
  status: EscrowStatus;
}

/**
 * Inputs for `create_escrow`. `id` is chosen by the caller (the escrow
 * contract does not allocate ids), and `amount` is a decimal string in the
 * token's smallest unit — scale it by the token's own `decimals()`, which is
 * 7 for XLM and SACs but not for every token.
 */
export interface CreateEscrowParams {
  id: string;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: string;
  deadline: number;
}
