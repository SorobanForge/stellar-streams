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
 * Expands a number's exponential notation into a plain decimal string so number
 * inputs parse exactly like the equivalent string input. `Number#toString`
 * switches to exponent form for very small/large magnitudes (e.g. `1e-8`);
 * passing that text to `parseTokenAmount` would otherwise reject a valid value.
 */
function numberToDecimalString(value: number): string {
  const text = value.toString();
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/.exec(text);
  if (!match) return text;

  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  const digits = whole + fraction;
  const point = whole.length + exponent;

  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * Parses a human-readable XLM amount into stroops. Equivalent to
 * `parseTokenAmount(xlm, XLM_DECIMALS)`; use that for non-XLM tokens.
 *
 * Accepted input is a plain decimal number (an optional `-`, digits, and at
 * most one `.`) with optional surrounding whitespace: `'1'`, `' 1.2 '`, `'.5'`
 * and `'1.'` all parse. Number inputs are first expanded from any exponential
 * notation, so `0.0000001` behaves exactly like `'0.0000001'`.
 *
 * Fractional digits beyond seven places are truncated toward zero, so any
 * amount smaller than one stroop — including `0.00000001` and
 * `-0.00000001` — parses to `0n` instead of throwing. Callers that require a
 * positive amount should check the result themselves.
 *
 * Scientific notation (`'1e7'`), `NaN`, `Infinity`, and other non-decimal
 * shapes throw an `Invalid XLM amount` error that names the offending input.
 */
export function parseXlmToStroops(xlm: string | number): bigint {
  // Reject non-finite numbers up front so the message explains the real
  // problem rather than complaining about their string form.
  if (typeof xlm === 'number' && !Number.isFinite(xlm)) {
    throw new Error(
      `Invalid XLM amount: ${String(xlm)}. Expected a finite decimal number (e.g. "1.5").`,
    );
  }

  const decimal = typeof xlm === 'number' ? numberToDecimalString(xlm) : xlm;
  try {
    return parseTokenAmount(decimal, XLM_DECIMALS);
  } catch {
    throw new Error(
      `Invalid XLM amount: ${JSON.stringify(xlm)}. Expected a plain decimal number such as "1.5" (scientific notation, NaN and Infinity are not supported).`,
    );
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

/**
 * Returns floor(a * b / c) for bigint inputs.
 *
 * Matches the contract's integer math: multiplication happens in bigint (no
 * i128 overflow risk at the call site), then floor division. Throws if c === 0n.
 */
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new Error('mulDiv: division by zero');
  return (a * b) / c;
}

/** A single point on a vesting curve suitable for plotting on a chart. */
export interface VestingPoint {
  t: number;
  vested: bigint;
}

/** Accepted stream input for vesting curve generation. Supports both shorthand and formal types. */
export interface VestingStreamInput {
  start?: number;
  startTime?: number;
  cliff?: number;
  cliffTime?: number;
  end?: number;
  endTime?: number;
  deposit?: bigint | number | string;
  totalAmount?: bigint | number | string;
  amount?: bigint | number | string;
}

/**
 * Generates N sample points along a stream's vesting schedule suitable for charting.
 *
 * Guarantees:
 * - Always includes both endpoints (`t = start` and `t = end`).
 * - Always includes the exact cliff timestamp (`t = cliff`).
 * - Vested amounts are monotonically non-decreasing and never exceed the total deposit.
 * - Pure and deterministic: identical inputs always produce the exact same points.
 */
export function vestingCurve(stream: VestingStreamInput, samples: number = 20): VestingPoint[] {
  const start = stream.start ?? stream.startTime ?? 0;
  const rawEnd = stream.end ?? stream.endTime ?? start;
  const end = Math.max(start, rawEnd);
  const rawCliff = stream.cliff ?? stream.cliffTime ?? start;
  const cliff = Math.min(Math.max(start, rawCliff), end);

  const rawDeposit = stream.deposit ?? stream.totalAmount ?? stream.amount ?? 0n;
  let deposit: bigint;
  if (typeof rawDeposit === 'bigint') {
    deposit = rawDeposit;
  } else if (typeof rawDeposit === 'number') {
    deposit = BigInt(Math.floor(rawDeposit));
  } else {
    deposit = BigInt(String(rawDeposit));
  }
  if (deposit < 0n) {
    deposit = 0n;
  }

  const schedule: VestingSchedule = {
    startTime: start,
    endTime: end,
    cliffTime: cliff,
    totalAmount: deposit,
  };

  if (end === start) {
    return [{ t: start, vested: deposit }];
  }

  const times = new Set<number>();
  times.add(start);
  times.add(end);
  times.add(cliff);

  const n = Math.max(2, Math.floor(samples));
  for (let i = 0; i < n; i++) {
    const t = Math.round(start + (i * (end - start)) / (n - 1));
    times.add(t);
  }

  const sortedTimes = Array.from(times).sort((a, b) => a - b);

  return sortedTimes.map((t) => ({
    t,
    vested: computeVestedAmount(schedule, t),
  }));
}
