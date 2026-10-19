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

/** Raw values returned by the Soroban `stream` contract. */
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
  label: string;
  reference: string;
  cancelled: boolean;
}

/** Error raised when a decoded contract response does not match its expected shape. */
export class ContractResponseError extends TypeError {
  readonly contract: string;
  readonly field: string;

  constructor(contract: string, field: string, expected: string) {
    super(`Invalid ${contract} contract response: field "${field}" must be ${expected}.`);
    this.name = 'ContractResponseError';
    this.contract = contract;
    this.field = field;
  }
}

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);

/** Check the runtime shape returned by the stream contract. */
export function isStream(value: unknown): value is RawStream {
  if (!isRecord(value)) return false;
  return typeof value.id === 'bigint'
    && typeof value.sender === 'string'
    && typeof value.recipient === 'string'
    && typeof value.token === 'string'
    && typeof value.total_amount === 'bigint'
    && typeof value.withdrawn === 'bigint'
    && typeof value.start_time === 'bigint'
    && typeof value.end_time === 'bigint'
    && typeof value.cliff_time === 'bigint'
    && typeof value.label === 'string'
    && typeof value.reference === 'string'
    && typeof value.cancelled === 'boolean';
}

function assertStream(value: unknown): asserts value is RawStream {
  const fields: Array<[string, (v: unknown) => boolean, string]> = [
    ['id', v => typeof v === 'bigint', 'a bigint'],
    ['sender', v => typeof v === 'string', 'a string'],
    ['recipient', v => typeof v === 'string', 'a string'],
    ['token', v => typeof v === 'string', 'a string'],
    ['total_amount', v => typeof v === 'bigint', 'a bigint'],
    ['withdrawn', v => typeof v === 'bigint', 'a bigint'],
    ['start_time', v => typeof v === 'bigint', 'a bigint'],
    ['end_time', v => typeof v === 'bigint', 'a bigint'],
    ['cliff_time', v => typeof v === 'bigint', 'a bigint'],
    ['label', v => typeof v === 'string', 'a string'],
    ['reference', v => typeof v === 'string', 'a string'],
    ['cancelled', v => typeof v === 'boolean', 'a boolean'],
  ];
  if (!isRecord(value)) throw new ContractResponseError('stream', '<response>', 'an object');
  for (const [field, check, expected] of fields) {
    if (!check(value[field])) throw new ContractResponseError('stream', field, expected);
  }
}

/** Convert the generated snake_case contract result into the UI domain shape. */
export function normalizeStream(raw: unknown): Stream {
  assertStream(raw);
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
    label: raw.label,
    reference: raw.reference,
    cancelled: raw.cancelled,
  };
}

/** Protocol configuration, mirroring the contract's `Config` struct. */
export interface StreamConfig {
  admin: string;
  treasury: string;
  feeBps: number;
}

/** Raw values returned by the Soroban `get_config` method. */
export interface RawConfig {
  admin: string;
  treasury: string;
  fee_bps: number;
}

/** Check the runtime shape returned by the stream contract's config method. */
export function isConfig(value: unknown): value is RawConfig {
  return isRecord(value)
    && typeof value.admin === 'string'
    && typeof value.treasury === 'string'
    && isInteger(value.fee_bps);
}

/** Convert a raw config response into its domain shape after validating it. */
export function normalizeConfig(raw: unknown): StreamConfig {
  if (!isRecord(raw)) throw new ContractResponseError('config', '<response>', 'an object');
  if (typeof raw.admin !== 'string') throw new ContractResponseError('config', 'admin', 'a string');
  if (typeof raw.treasury !== 'string') throw new ContractResponseError('config', 'treasury', 'a string');
  if (!isInteger(raw.fee_bps)) throw new ContractResponseError('config', 'fee_bps', 'an integer');
  return { admin: raw.admin, treasury: raw.treasury, feeBps: raw.fee_bps };
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

/** Raw values returned by the Soroban `splits` contract. */
export interface RawSplit {
  id: bigint;
  creator: string;
  recipients: string[];
  shares: number[];
  total_shares: number;
}

/** Convert a generated snake_case split result into the domain shape. */
export function normalizeSplit(raw: RawSplit): Split {
  return {
    id: raw.id.toString(),
    creator: raw.creator,
    recipients: raw.recipients,
    shares: raw.shares,
    totalShares: raw.total_shares,
  };
}

/** Derives a human-facing status for a stream at a given timestamp. */
export function getStreamStatus(stream: Stream, now: number): StreamStatus {
  if (stream.cancelled) return 'cancelled';
  if (now < stream.startTime || now < stream.cliffTime) return 'scheduled';
  if (now >= stream.endTime) return 'completed';
  return 'streaming';
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
  deadline: string;
  status: EscrowStatus;
}

/** Raw values returned by the Soroban `escrow` contract. */
export interface RawEscrow {
  id: bigint;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  status: number;
}

/** Check the runtime shape returned by the escrow contract. */
export function isEscrow(value: unknown): value is RawEscrow {
  return isRecord(value)
    && typeof value.id === 'bigint'
    && typeof value.payer === 'string'
    && typeof value.payee === 'string'
    && typeof value.arbiter === 'string'
    && typeof value.token === 'string'
    && typeof value.amount === 'bigint'
    && typeof value.deadline === 'bigint'
    && isInteger(value.status);
}

function assertEscrow(value: unknown): asserts value is RawEscrow {
  if (!isRecord(value)) throw new ContractResponseError('escrow', '<response>', 'an object');
  const fields: Array<[string, (v: unknown) => boolean, string]> = [
    ['id', v => typeof v === 'bigint', 'a bigint'],
    ['payer', v => typeof v === 'string', 'a string'],
    ['payee', v => typeof v === 'string', 'a string'],
    ['arbiter', v => typeof v === 'string', 'a string'],
    ['token', v => typeof v === 'string', 'a string'],
    ['amount', v => typeof v === 'bigint', 'a bigint'],
    ['deadline', v => typeof v === 'bigint', 'a bigint'],
    ['status', isInteger, 'an integer'],
  ];
  for (const [field, check, expected] of fields) {
    if (!check(value[field])) throw new ContractResponseError('escrow', field, expected);
  }
}

/** Convert a generated snake_case escrow result into the domain shape. */
export function normalizeEscrow(raw: unknown): Escrow {
  assertEscrow(raw);
  const status = ESCROW_STATUSES[Number(raw.status)];
  if (!status) throw new Error(`Unknown escrow status index: ${raw.status}`);
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

const ESCROW_STATUSES: readonly EscrowStatus[] = [
  'created', 'funded', 'released', 'refunded', 'cancelled',
];

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
  deadline: string;
}
