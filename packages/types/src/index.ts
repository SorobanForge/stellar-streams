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
}

export type StreamStatus = 'scheduled' | 'streaming' | 'completed' | 'cancelled';

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

/* ------------------------------------------------------------------ *
 * Runtime guards for contract responses.
 *
 * `scValToNative` hands the normalizers a shape nobody has checked: a
 * contract upgrade or a decoding surprise would otherwise surface as
 * `undefined` somewhere deep in the UI. These dependency-free guards (no zod)
 * validate field presence and basic types at the boundary, and the normalizers
 * below call them so a bad payload fails immediately with a typed error that
 * names the offending field.
 * ------------------------------------------------------------------ */

/**
 * Thrown when a contract payload fails a guard. Carries the entity and the
 * exact field that is missing or has the wrong type, so the failure message
 * points at the field instead of at `undefined` in the UI.
 */
export class ContractShapeError extends Error {
  /** Entity whose payload failed validation (`Stream`, `Config`, `Escrow` or `Split`). */
  readonly entity: string;
  /** The raw (snake_case) field that is missing or has the wrong type. */
  readonly field: string;
  /** The type the field was expected to have. */
  readonly expected: string;

  constructor(entity: string, field: string, expected: string) {
    super(`${entity}: missing or invalid field "${field}" (expected ${expected})`);
    this.name = 'ContractShapeError';
    this.entity = entity;
    this.field = field;
    this.expected = expected;
  }
}

/** A per-field check for a raw contract struct: the expected type and how to test it. */
interface FieldGuard {
  expected: string;
  ok: (value: unknown) => boolean;
}

const isBigInt: FieldGuard = { expected: 'bigint', ok: (value) => typeof value === 'bigint' };
const isString: FieldGuard = { expected: 'string', ok: (value) => typeof value === 'string' };
const isBoolean: FieldGuard = { expected: 'boolean', ok: (value) => typeof value === 'boolean' };
const isNumber: FieldGuard = {
  expected: 'number',
  ok: (value) => typeof value === 'number' && Number.isFinite(value),
};
const isStringArray: FieldGuard = {
  expected: 'string[]',
  ok: (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
};
const isNumberArray: FieldGuard = {
  expected: 'number[]',
  ok: (value) =>
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
};

/** Field checks for each raw struct, exhaustive over its keys (`satisfies` enforces this). */
const STREAM_GUARDS = {
  id: isBigInt,
  sender: isString,
  recipient: isString,
  token: isString,
  total_amount: isBigInt,
  withdrawn: isBigInt,
  start_time: isBigInt,
  end_time: isBigInt,
  cliff_time: isBigInt,
  cancelled: isBoolean,
} satisfies Record<keyof RawStream, FieldGuard>;

const CONFIG_GUARDS = {
  admin: isString,
  treasury: isString,
  fee_bps: isNumber,
} satisfies Record<keyof RawConfig, FieldGuard>;

const ESCROW_GUARDS = {
  id: isBigInt,
  payer: isString,
  payee: isString,
  arbiter: isString,
  token: isString,
  amount: isBigInt,
  deadline: isBigInt,
  status: isNumber,
} satisfies Record<keyof RawEscrow, FieldGuard>;

const SPLIT_GUARDS = {
  id: isBigInt,
  creator: isString,
  recipients: isStringArray,
  shares: isNumberArray,
  total_shares: isNumber,
} satisfies Record<keyof RawSplit, FieldGuard>;

/** Returns the first field of `spec` missing from or wrong-typed in `value`, else `null`. */
function findInvalidField(value: unknown, spec: Record<string, FieldGuard>): string | null {
  const record = value as Record<string, unknown> | null | undefined;
  for (const [field, guard] of Object.entries(spec)) {
    if (!guard.ok(record?.[field])) return field;
  }
  return null;
}

/** Builds the `ContractShapeError` for the first invalid field of `value`. */
function shapeError(
  entity: string,
  value: unknown,
  spec: Record<string, FieldGuard>,
): ContractShapeError {
  const field = findInvalidField(value, spec) ?? Object.keys(spec)[0]!;
  return new ContractShapeError(entity, field, spec[field]!.expected);
}

/** True when `value` has the shape of the `stream` contract's `Stream` struct. */
export function isStream(value: unknown): value is RawStream {
  return findInvalidField(value, STREAM_GUARDS) === null;
}

/** True when `value` has the shape of the `stream` contract's `Config` struct. */
export function isConfig(value: unknown): value is RawConfig {
  return findInvalidField(value, CONFIG_GUARDS) === null;
}

/** True when `value` has the shape of the `escrow` contract's `Escrow` struct. */
export function isEscrow(value: unknown): value is RawEscrow {
  return findInvalidField(value, ESCROW_GUARDS) === null;
}

/** True when `value` has the shape of the `splits` contract's `Split` struct. */
export function isSplit(value: unknown): value is RawSplit {
  return findInvalidField(value, SPLIT_GUARDS) === null;
}

/** Converts the `stream` contract's `Stream` struct into the domain type. */
export function normalizeStream(raw: RawStream): Stream {
  if (!isStream(raw)) throw shapeError('Stream', raw, STREAM_GUARDS);
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
  if (!isConfig(raw)) throw shapeError('Config', raw, CONFIG_GUARDS);
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
  if (!isEscrow(raw)) throw shapeError('Escrow', raw, ESCROW_GUARDS);
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
  if (!isSplit(raw)) throw shapeError('Split', raw, SPLIT_GUARDS);
  return {
    id: raw.id.toString(),
    creator: raw.creator,
    recipients: [...raw.recipients],
    shares: [...raw.shares],
    totalShares: raw.total_shares,
  };
}
