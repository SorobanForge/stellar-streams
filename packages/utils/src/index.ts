/**
 * Formatting and vesting-math helpers shared across the Stellar Streams stack.
 * All monetary math is done with `bigint` to avoid IEEE-754 precision loss.
 */

/** Decimal places of native XLM and of every Stellar Asset Contract (SAC). */
export const XLM_DECIMALS = 7;

/** Number of stroops in one XLM (1 XLM = 10^7 stroops). */
export const STROOPS_PER_XLM = 10_000_000n;

/** Shortens a public key/address for display purposes (e.g. GABC...XYZ1). */
export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

function assertDecimals(decimals: number): void {
  // SEP-41 `decimals()` is a u32; i128 holds at most 38 significant digits.
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 38) {
    throw new Error(`Invalid token decimals: ${String(decimals)}`);
  }
}

/**
 * Formats a raw on-chain token amount (the smallest unit) into a human-readable
 * string using the token's `decimals`, preserving precision for values larger
 * than `Number.MAX_SAFE_INTEGER`. Read `decimals` from the token contract
 * (e.g. `StreamsClient.getTokenMetadata`) rather than assuming 7.
 */
export function formatTokenAmount(raw: bigint | number | string, decimals: number): string {
  assertDecimals(decimals);
  const value = BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);

  const whole = abs / unit;
  const fraction = abs % unit;
  const sign = negative ? '-' : '';

  if (fraction === 0n) return `${sign}${whole.toString()}`;

  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${sign}${whole.toString()}.${fractionStr}`;
}

/**
 * Parses a human-readable token amount into its smallest unit using the
 * token's `decimals`. Fractional digits beyond `decimals` places are truncated
 * (they are below the smallest unit).
 */
export function parseTokenAmount(amount: string | number, decimals: number): bigint {
  assertDecimals(decimals);
  const raw = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (!/^-?\d*(\.\d*)?$/.test(raw) || raw === '' || raw === '.' || raw === '-') {
    throw new Error(`Invalid token amount: ${String(amount)}`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);

  const result = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0');
  return negative ? -result : result;
}

/**
 * Formats a raw stroop amount into a human-readable XLM string. Equivalent to
 * `formatTokenAmount(stroops, XLM_DECIMALS)`; use that for non-XLM tokens.
 */
export function formatStroopsToXlm(stroops: bigint | number | string): string {
  return formatTokenAmount(stroops, XLM_DECIMALS);
}

/**
 * Parses a human-readable XLM amount into stroops. Equivalent to
 * `parseTokenAmount(xlm, XLM_DECIMALS)`; use that for non-XLM tokens.
 */
export function parseXlmToStroops(xlm: string | number): bigint {
  try {
    return parseTokenAmount(xlm, XLM_DECIMALS);
  } catch {
    throw new Error(`Invalid XLM amount: ${String(xlm)}`);
  }
}

/** Formats a duration in seconds into a compact human string (e.g. "2d 3h 4m"). */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${total}s`);
  return parts.join(' ');
}

/** A linear vesting schedule, mirroring the on-chain `Stream` time fields. */
export interface VestingSchedule {
  totalAmount: bigint;
  startTime: number;
  endTime: number;
  cliffTime: number;
}

/**
 * Computes the amount vested at `now`, using the same integer math as the
 * `stream` Soroban contract. Keep this in sync with `vested_amount` in Rust.
 */
export function computeVestedAmount(schedule: VestingSchedule, now: number): bigint {
  const { totalAmount, startTime, endTime, cliffTime } = schedule;
  if (now < startTime || now < cliffTime) return 0n;
  if (now >= endTime) return totalAmount;

  const elapsed = BigInt(now - startTime);
  const duration = BigInt(endTime - startTime);
  return (totalAmount * elapsed) / duration;
}

/** How much of the stream has vested, expressed in basis points (0–10000). */
export function computeProgressBps(schedule: VestingSchedule, now: number): number {
  const { totalAmount, endTime, startTime } = schedule;
  if (totalAmount <= 0n) return 0;
  if (now <= startTime) return 0;
  if (now >= endTime) return 10_000;

  const elapsed = BigInt(now - startTime);
  const duration = BigInt(endTime - startTime);
  return Number(((elapsed * 10_000n) / duration).valueOf());
}

/**
 * Lifecycle status of a stream, as displayed to users. Defined next to the
 * derivation that produces it and re-exported by `@stellar-starter-kit/types`
 * for back-compat.
 */
export type StreamStatus = 'scheduled' | 'streaming' | 'completed' | 'cancelled';

/**
 * The subset of a `Stream` that drives every derived field. Deliberately
 * structural (no import from `@stellar-starter-kit/types`) so the shared
 * `types` package can delegate here without a dependency cycle.
 */
export interface StreamStateInput {
  /** Total amount in the token's smallest unit (decimal string or bigint). */
  totalAmount: string | bigint;
  /** Already-withdrawn amount in the token's smallest unit (decimal string or bigint). */
  withdrawn: string | bigint;
  startTime: number;
  endTime: number;
  cliffTime: number;
  cancelled: boolean;
}

/** Everything the UI renders about a stream, derived once at one timestamp. */
export interface StreamState {
  status: StreamStatus;
  /** Vested fraction in basis points (0–10000); 0 exactly while `scheduled`. */
  progressBps: number;
  /** What the recipient can withdraw now: `max(0, vested − withdrawn)`, mirroring the contract's `claimable()`. */
  claimable: bigint;
  /** Seconds until `endTime`, clamped at 0. */
  remainingSeconds: number;
}

/** Status at `now`, with the contract's precedence: cancelled, then the time gates, then completion. */
function deriveStatus(stream: StreamStateInput, now: number): StreamStatus {
  if (stream.cancelled) return 'cancelled';
  if (now < stream.startTime || now < stream.cliffTime) return 'scheduled';
  if (now >= stream.endTime) return 'completed';
  return 'streaming';
}

/**
 * Derives a stream's status, progress, claimable amount and remaining time
 * from a single point in time, so two packages can never disagree about the
 * same stream (e.g. around the cliff, where time-based progress used to run
 * while the status still read `scheduled`).
 *
 * All four fields mirror the on-chain `stream` contract:
 * - `status` follows `get_stream`'s time gates (cancelled takes precedence);
 * - `progressBps` is 0 while `scheduled`, 10000 at/after `endTime`, and the
 *   time-based `computeProgressBps` in between;
 * - `claimable` matches `claimable()`: `max(0, vested_amount(now) − withdrawn)`
 *   (`cancel` compresses the schedule on-chain, so a cancelled stream derives
 *   as fully vested);
 * - `remainingSeconds` is `max(0, endTime − now)`.
 */
export function deriveStreamState(stream: StreamStateInput, now: number): StreamState {
  const status = deriveStatus(stream, now);
  const schedule: VestingSchedule = {
    totalAmount: BigInt(stream.totalAmount),
    startTime: stream.startTime,
    endTime: stream.endTime,
    cliffTime: stream.cliffTime,
  };

  let progressBps: number;
  if (status === 'scheduled') progressBps = 0;
  else if (now >= stream.endTime) progressBps = 10_000;
  else progressBps = computeProgressBps(schedule, now);

  const claimable = computeVestedAmount(schedule, now) - BigInt(stream.withdrawn);
  return {
    status,
    progressBps,
    claimable: claimable > 0n ? claimable : 0n,
    remainingSeconds: Math.max(0, stream.endTime - now),
  };
}

/** Formats basis points as a percentage string (e.g. 2550 -> "25.5%"). */
export function formatBps(bps: number): string {
  const clamped = Math.max(0, Math.min(10_000, bps));
  return `${(clamped / 100).toFixed(clamped % 100 === 0 ? 0 : 1)}%`;
}
