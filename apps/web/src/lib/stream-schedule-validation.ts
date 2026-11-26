/**
 * Schedule validation for stream creation.
 *
 * This module deliberately depends on neither React nor the Stellar SDK: the
 * boundaries it covers (cliff at the start, cliff at the end, a zero-length
 * window and a start in the past) are pure arithmetic and stay fast to test.
 */

export interface StreamScheduleInput {
  /** Unix timestamp in seconds at which vesting starts. */
  startTime: number;
  /** Unix timestamp in seconds at which the stream is fully vested. */
  endTime: number;
  /** Unix timestamp in seconds before which nothing is claimable. */
  cliffTime: number;
}

export type StreamScheduleField = keyof StreamScheduleInput;
export type StreamScheduleErrors = Partial<Record<StreamScheduleField, string>>;

/** `startTime` is earlier than the current ledger time. */
export const PAST_START_MESSAGE = 'Start time cannot be in the past.';
/** `endTime` is at or before `startTime`, so nothing can ever vest. */
export const ZERO_DURATION_MESSAGE = 'Stream duration must be greater than zero.';
/** The cliff sits before the start or after the end. */
export const CLIFF_OUTSIDE_WINDOW_MESSAGE =
  'Cliff must fall between the start and end of the stream.';

/**
 * Validates a stream schedule.
 *
 * A cliff equal to `startTime` (no cliff) and a cliff equal to `endTime` (the
 * whole stream is locked until the end) are both valid. A cliff outside the
 * closed `[startTime, endTime]` interval, a zero-length window, and a start in
 * the past each produce their documented message above.
 *
 * @param input - Timestamps in seconds.
 * @param nowSeconds - Current time in seconds; injectable for deterministic tests.
 */
export function validateStreamSchedule(
  input: StreamScheduleInput,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): StreamScheduleErrors {
  const errors: StreamScheduleErrors = {};
  const { startTime, endTime, cliffTime } = input;

  if (!Number.isFinite(startTime) || startTime < nowSeconds) {
    errors.startTime = PAST_START_MESSAGE;
  }

  if (!Number.isFinite(endTime) || !Number.isFinite(startTime) || endTime <= startTime) {
    errors.endTime = ZERO_DURATION_MESSAGE;
  }

  // A cliff only has meaning inside a positive-length window; reporting both a
  // duration error and a cliff error for the same input is noise.
  if (
    !errors.endTime &&
    (!Number.isFinite(cliffTime) || cliffTime < startTime || cliffTime > endTime)
  ) {
    errors.cliffTime = CLIFF_OUTSIDE_WINDOW_MESSAGE;
  }

  return errors;
}

/** Convenience wrapper for callers that only need a boolean. */
export function isStreamScheduleValid(
  input: StreamScheduleInput,
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): boolean {
  return Object.keys(validateStreamSchedule(input, nowSeconds)).length === 0;
}
