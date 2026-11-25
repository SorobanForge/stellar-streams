/** Replaces bigint values so stream records serialize as decimal strings. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Parses an amount in the token's smallest unit. Streams store integer
 * amounts, so a decimal like `1.5` is rejected instead of silently rounded.
 */
export function parseAmount(value: string): string {
  const normalized = value.replace(/_/g, '');
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid amount "${value}": expected a whole number of base units.`);
  }
  const amount = normalized.replace(/^0+(?=\d)/, '');
  if (amount === '0') {
    throw new Error('Invalid amount "0": a stream must lock a positive amount.');
  }
  return amount;
}

/**
 * Parses a timestamp from unix seconds or an ISO 8601 date. Unix seconds keep
 * the CLI's output deterministic and match the contract's `u64` fields.
 */
export function parseTimestamp(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp "${value}": use unix seconds or an ISO 8601 date.`);
  }
  return Math.floor(parsed / 1000);
}

/** Validates a stream schedule before the SDK simulates it. */
export function assertSchedule(startTime: number, endTime: number, cliffTime: number): void {
  if (endTime <= startTime) {
    throw new Error('The stream end time must be later than its start time.');
  }
  if (cliffTime < startTime || cliffTime > endTime) {
    throw new Error('The cliff time must fall between the start and end times.');
  }
}
