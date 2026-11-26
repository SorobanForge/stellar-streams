import { parseTokenAmount } from '@stellar-starter-kit/utils';

/**
 * Copy shown for contract errors that a sender can act on. Contract codes come
 * from `StreamError` in `contracts/stream/src/lib.rs`; anything not listed here
 * falls back to the raw SDK message.
 */
const ACTION_ERROR_COPY: Record<string, string> = {
  REDUCTION_BELOW_VESTED: 'The new total cannot be below the amount that has already vested.',
  INVALID_REDUCTION: 'The new total must be lower than the current total.',
  STREAM_COMPLETED: 'This stream has already ended and can no longer be topped up.',
  AMOUNT_OVERFLOW: 'That amount is too large for this stream.',
  ALREADY_CANCELLED: 'This stream was cancelled, so its total can no longer change.',
  STREAM_NOT_FOUND: 'This stream no longer exists.',
  UNAUTHORIZED: 'Only the stream sender can change its total.',
};

/** Shape of the SDK/hook error used to pick a readable message. */
export interface StreamActionErrorLike {
  message: string;
  code?: string | null;
}

/**
 * Parses a user-entered token amount into its smallest unit.
 *
 * Returns `null` for an empty, malformed, or non-positive value so callers can
 * show one validation message regardless of which check failed.
 */
export function parsePositiveTokenAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  try {
    const raw = parseTokenAmount(trimmed, decimals);
    return raw > 0n ? raw : null;
  } catch {
    return null;
  }
}

/** Validates the top-up amount; returns an error message or `null`. */
export function validateTopUpAmount(value: string, decimals = 7): string | null {
  if (value.trim() === '') return 'Enter an amount to add.';
  if (parsePositiveTokenAmount(value, decimals) === null) {
    return 'Amount must be a positive number.';
  }
  return null;
}

/**
 * Validates a new total against the stream's current total.
 *
 * The contract also enforces that the total is at least the vested amount;
 * this check only catches the obvious non-reductions before a wallet prompt.
 */
export function validateReduceTotal(
  value: string,
  currentTotal: bigint,
  decimals = 7,
): string | null {
  if (value.trim() === '') return 'Enter the new total.';
  const newTotal = parsePositiveTokenAmount(value, decimals);
  if (newTotal === null) return 'New total must be a positive number.';
  if (newTotal >= currentTotal) return 'New total must be lower than the current total.';
  return null;
}

/**
 * Returns readable copy for a failed top-up or reduction.
 *
 * A contract code wins over the raw message, because the SDK diagnostics are
 * long and include the simulated host error.
 */
export function describeStreamActionError(
  error: StreamActionErrorLike | string | null,
  code?: string | null,
): string | null {
  if (error === null) return null;
  const message = typeof error === 'string' ? error : error.message;
  const resolvedCode = code ?? (typeof error === 'string' ? null : error.code) ?? null;
  return (resolvedCode && ACTION_ERROR_COPY[resolvedCode]) || message || 'Transaction failed.';
}
