/**
 * Formatting and vesting-math helpers shared across the Stellar Streams stack.
 * All monetary math is done with `bigint` to avoid IEEE-754 precision loss.
 */

/** Decimal places of native XLM and of every Stellar Asset Contract (SAC). */
export const XLM_DECIMALS = 7;

/** Number of stroops in one XLM (1 XLM = 10^7 stroops). */
export const STROOPS_PER_XLM = 10_000_000n;

/**
 * Serializes records as RFC 4180 CSV with a header row in the requested order.
 * Bigints are written as base-10 integers, and string amounts stay strings, so
 * callers can export on-chain values without passing them through a float.
 */
export function toCsv<T extends object>(
  streams: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const escape = (value: unknown): string => {
    const text = value == null ? '' : typeof value === 'bigint' ? value.toString() : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = [
    columns.map(escape).join(','),
    ...streams.map((stream) => {
      const record = stream as Record<string, unknown>;
      return columns.map((column) => escape(record[column])).join(',');
    }),
  ];
  return rows.join('\r\n');
}

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
 * `10n ** BigInt(decimals)` for every legal `decimals` value, computed once.
 * Re-evaluating the exponentiation on each parse dominated its cost
 * (see `index.bench.ts`).
 */
const POWERS_OF_TEN: readonly bigint[] = Array.from(
  { length: 39 },
  (_, exponent) => 10n ** BigInt(exponent),
);

/**
 * True when `raw` is exactly `-?digits*.digits*` with at least one character,
 * accepting the same shapes as `^-?\d*(\.\d*)?$` while skipping the regex and
 * the intermediate string allocations. A lone `-` or `.` is not an amount.
 */
function isPlainDecimal(raw: string): boolean {
  const length = raw.length;
  if (length === 0) return false;

  let index = raw.charCodeAt(0) === 45 /* '-' */ ? 1 : 0;
  for (; index < length; index++) {
    const code = raw.charCodeAt(index);
    if (code >= 48 /* '0' */ && code <= 57 /* '9' */) continue;
    if (code !== 46 /* '.' */) return false;
    // Everything after the decimal point has to be a digit.
    for (index++; index < length; index++) {
      const digit = raw.charCodeAt(index);
      if (digit < 48 || digit > 57) return false;
    }
    break;
  }

  return raw !== '-' && raw !== '.';
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
  if (!isPlainDecimal(raw)) {
    throw new Error(`Invalid token amount: ${String(amount)}`);
  }

  const negative = raw.charCodeAt(0) === 45; // '-'
  const unsigned = negative ? raw.slice(1) : raw;
  const pointIndex = unsigned.indexOf('.');
  const whole = pointIndex === -1 ? unsigned : unsigned.slice(0, pointIndex);
  const fraction = pointIndex === -1 ? '' : unsigned.slice(pointIndex + 1);
  const paddedFraction =
    fraction.length >= decimals ? fraction.slice(0, decimals) : fraction.padEnd(decimals, '0');

  const result = BigInt(whole || '0') * POWERS_OF_TEN[decimals] + BigInt(paddedFraction || '0');
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

/**
 * Computes the amount claimable by the recipient at `now`, mirroring the
 * `claimable` view and the claimable calculation inside `withdraw` in the
 * `stream` Soroban contract (contracts/stream/src/lib.rs):
 *
 * claimable = max(vested - withdrawn, 0)
 *
 * The vested amount uses the same integer arithmetic as `computeVestedAmount`.
 *
 * The parameter is structural rather than an import of `Stream` from
 * `@stellar-starter-kit/types` so this package stays dependency-free and the
 * types -> utils dependency never becomes a cycle.
 */
export interface ClaimableStream {
  totalAmount: string | bigint | number;
  startTime: number;
  endTime: number;
  cliffTime: number;
  withdrawn: string | bigint | number;
}

export function computeClaimable(stream: ClaimableStream, now: number): bigint {
  const vested = computeVestedAmount(
    {
      totalAmount: BigInt(stream.totalAmount),
      startTime: stream.startTime,
      endTime: stream.endTime,
      cliffTime: stream.cliffTime,
    },
    now,
  );
  const withdrawn = BigInt(stream.withdrawn);
  const claimable = vested - withdrawn;
  return claimable > 0n ? claimable : 0n;
}

/**
 * Computes the protocol fee on a claimable amount, mirroring the `withdraw`
 * logic in the `stream` Soroban contract (contracts/stream/src/lib.rs):
 *
 * fee = claimable * feeBps / 10_000   (integer division, truncated toward zero)
 */
export function computeProtocolFee(claimable: bigint, feeBps: number): bigint {
  return (claimable * BigInt(feeBps)) / 10_000n;
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
