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

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** A "month" is a flat 30 days so schedules stay deterministic. */
const MONTH = 30 * DAY;
/** A "year" is a flat 365 days so schedules stay deterministic. */
const YEAR = 365 * DAY;

/**
 * Formats a duration in seconds into a compact human string (e.g. "2d 3h 4m").
 *
 * Durations up to and including 7 days keep the exact day/hour/minute/second
 * rendering (falling back to seconds when nothing larger applies). Longer
 * durations add weeks, months and years and show only the **two most
 * significant non-zero units**: a year counts as exactly 365 days, a month as
 * exactly 30 days, and zero units between them are skipped rather than shown
 * (e.g. 382 days renders as `1y 2w`, never `1y 0mo 2w 3d`).
 *
 * Rounding: every unit truncates toward zero (whole units only) and the
 * remainder below the second displayed unit is dropped, never rounded up —
 * 400 days renders `1y 1mo` and silently drops the remaining 5 days.
 * Negative input clamps to `0s`.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));

  if (total <= WEEK) {
    const days = Math.floor(total / DAY);
    const hours = Math.floor((total % DAY) / HOUR);
    const minutes = Math.floor((total % HOUR) / MINUTE);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (parts.length === 0) parts.push(`${total}s`);
    return parts.join(' ');
  }

  const units: Array<readonly [size: number, suffix: string]> = [
    [YEAR, 'y'],
    [MONTH, 'mo'],
    [WEEK, 'w'],
    [DAY, 'd'],
    [HOUR, 'h'],
    [MINUTE, 'm'],
  ];

  const parts: string[] = [];
  let rest = total;
  for (const [size, suffix] of units) {
    if (parts.length === 2) break;
    const value = Math.floor(rest / size);
    if (value > 0) {
      parts.push(`${value}${suffix}`);
      rest -= value * size;
    }
  }
  return parts.join(' ');
}

const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

/**
 * Formats the gap between two unix timestamps (seconds) as a short relative
 * string: `in 3d`, `2h ago`, or `just now` for anything under a minute (and for
 * a zero delta). Deltas larger than a day are kept in days so the output stays
 * unambiguous for long vesting schedules.
 *
 * `now` is always passed in — the helper never reads the clock itself, so the
 * output is deterministic and cheap to test. Negative deltas describe the past
 * (`ago`), positive ones the future (`in`). Non-finite inputs fall back to
 * `just now` instead of rendering `NaN` into the UI.
 *
 *      formatRelativeTime(cliffTime, now) // "in 3d"
 *      formatRelativeTime(startTime, now) // "2h ago"
 */
export function formatRelativeTime(from: number, now: number): string {
  const delta = Math.trunc(from) - Math.trunc(now);
  if (!Number.isFinite(delta)) return 'just now';

  const magnitude = Math.abs(delta);
  if (magnitude < MINUTE_SECONDS) return 'just now';

  let unit = 'd';
  let secondsPerUnit = DAY_SECONDS;
  if (magnitude < HOUR_SECONDS) {
    unit = 'm';
    secondsPerUnit = MINUTE_SECONDS;
  } else if (magnitude < DAY_SECONDS) {
    unit = 'h';
    secondsPerUnit = HOUR_SECONDS;
  }
  const value = Math.floor(magnitude / secondsPerUnit);

  return delta > 0 ? `in ${value}${unit}` : `${value}${unit} ago`;
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

/** Formats basis points as a percentage string (e.g. 2550 -> "25.5%"). */
export function formatBps(bps: number): string {
  const clamped = Math.max(0, Math.min(10_000, bps));
  return `${(clamped / 100).toFixed(clamped % 100 === 0 ? 0 : 1)}%`;
}
