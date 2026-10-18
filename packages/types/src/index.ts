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
  if (stream.cancelled) return 'cancelled';
  if (now < stream.startTime || now < stream.cliffTime) return 'scheduled';
  if (now >= stream.endTime) return 'completed';
  return 'streaming';
}

/**
 * Lifecycle state of an escrow agreement, mirroring the `escrow` contract's
 * `EscrowStatus` enum (`Created` = 0 … `Cancelled` = 4). Lowercase, like
 * `StreamStatus`, so it reads the same way wherever it is rendered.
 */
export type EscrowStatus = 'created' | 'funded' | 'released' | 'refunded' | 'cancelled';

/**
 * An escrow agreement, mirroring the `escrow` Soroban contract.
 * `u64` / `i128` fields are carried as decimal strings because they exceed
 * JavaScript's safe integer range.
 */
export interface Escrow {
  /** Caller-chosen agreement id (`u64`). */
  id: string;
  payer: string;
  payee: string;
  arbiter: string;
  /** Token contract id (C…) whose balance is held in escrow. */
  token: string;
  /** Escrowed amount in the token's smallest unit (`i128`). */
  amount: string;
  /** Unix seconds after which a funded escrow may be cancelled (`u64`). */
  deadline: string;
  status: EscrowStatus;
}

/**
 * A payment split, mirroring the `splits` Soroban contract: a fixed set of
 * recipients paid proportionally to `shares`. The `u64` id is a decimal
 * string; `u32` shares fit in a number.
 */
export interface Split {
  id: string;
  creator: string;
  recipients: string[];
  /** Weight of `recipients[i]`; the payout of `recipients[i]` is `shares[i] / totalShares`. */
  shares: number[];
  totalShares: number;
}

/* ------------------------------------------------------------------ *
 * Contract structs and their normalizers.
 *
 * The structs below are what `scValToNative` and the generated bindings
 * decode: `u64` / `i128` arrive as `bigint` and the Rust field names stay
 * snake_case. The normalizers convert them to the camelCase domain types
 * above, exactly as `normalizeStream` does for `Stream`.
 * ------------------------------------------------------------------ */

/** The `stream` contract's `Stream` struct, as decoded from XDR. */
export interface RawStream {
  id: bigint;
  sender: string;
  recipient: string;
  token: string;
  total_amount: bigint;
  withdrawn: bigint;
  start_time: bigint;
  end_time: bigint;
  cliff_time: bigint;
  cancelled: boolean;
}

/** The `stream` contract's `Config` struct, as decoded from XDR. */
export interface RawConfig {
  admin: string;
  treasury: string;
  fee_bps: number;
}

/** The `escrow` contract's `Escrow` struct, as decoded from XDR. */
export interface RawEscrow {
  id: bigint;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  /** Numeric `EscrowStatus` variant (`Created` = 0 … `Cancelled` = 4). */
  status: number;
}

/** The `splits` contract's `Split` struct, as decoded from XDR. */
export interface RawSplit {
  id: bigint;
  creator: string;
  recipients: string[];
  shares: number[];
  total_shares: number;
}

/** Converts the `stream` contract's `Stream` struct into the domain type. */
export function normalizeStream(raw: RawStream): Stream {
  return {
    id: raw.id.toString(),
    sender: raw.sender,
    recipient: raw.recipient,
    token: raw.token,
    totalAmount: raw.total_amount.toString(),
    withdrawn: raw.withdrawn.toString(),
    startTime: Number(raw.start_time),
    endTime: Number(raw.end_time),
    cliffTime: Number(raw.cliff_time),
    cancelled: raw.cancelled,
  };
}

/** Converts the `stream` contract's `Config` struct into the domain type. */
export function normalizeConfig(raw: RawConfig): StreamConfig {
  return { admin: raw.admin, treasury: raw.treasury, feeBps: Number(raw.fee_bps) };
}

/** Numeric variant of `EscrowStatus`, in declaration order. */
const ESCROW_STATUS_BY_CODE: readonly EscrowStatus[] = [
  'created',
  'funded',
  'released',
  'refunded',
  'cancelled',
];

/** Converts the `escrow` contract's `Escrow` struct into the domain type. */
export function normalizeEscrow(raw: RawEscrow): Escrow {
  const status: EscrowStatus | undefined = ESCROW_STATUS_BY_CODE[raw.status];
  if (!status) {
    throw new Error(`Unknown escrow status: ${raw.status}`);
  }
  return {
    id: raw.id.toString(),
    payer: raw.payer,
    payee: raw.payee,
    arbiter: raw.arbiter,
    token: raw.token,
    amount: raw.amount.toString(),
    deadline: raw.deadline.toString(),
    status,
  };
}

/** Converts the `splits` contract's `Split` struct into the domain type. */
export function normalizeSplit(raw: RawSplit): Split {
  return {
    id: raw.id.toString(),
    creator: raw.creator,
    recipients: [...raw.recipients],
    shares: [...raw.shares],
    totalShares: raw.total_shares,
  };
}
