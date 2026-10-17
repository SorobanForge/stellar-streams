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

/** Formats basis points as a percentage string (e.g. 2550 -> "25.5%"). */
export function formatBps(bps: number): string {
  const clamped = Math.max(0, Math.min(10_000, bps));
  return `${(clamped / 100).toFixed(clamped % 100 === 0 ? 0 : 1)}%`;
}
