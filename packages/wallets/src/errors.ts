/**
 * Raised when the active wallet adapter cannot perform a requested operation.
 *
 * Adapters implement only what their wallet API actually exposes, so callers
 * need to distinguish "this wallet cannot do that" from a user rejection or a
 * signing failure. Returning an empty string instead would look like a
 * successful signature, which is why the unsupported branches throw instead.
 */
export class NotSupportedError extends Error {
  readonly code = 'NOT_SUPPORTED';

  constructor(method: string, wallet: string) {
    super(`${wallet} does not support ${method}.`);
    this.name = 'NotSupportedError';
  }
}

/**
 * Raised when the user explicitly declines a signing request.
 *
 * Distinct from `WalletCancelledError`: a rejection is a decision the user
 * made against a transaction they saw, while a cancellation means the prompt
 * was dismissed without a decision. Callers can branch on `code` to offer a
 * retry only where it makes sense.
 */
export class WalletRejectedError extends Error {
  readonly code = 'WALLET_REJECTED';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletRejectedError';
  }
}

/**
 * Raised when a signing prompt is dismissed before the user approves or
 * rejects it (window closed, request aborted, navigation).
 */
export class WalletCancelledError extends Error {
  readonly code = 'WALLET_CANCELLED';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WalletCancelledError';
  }
}

/**
 * Raised when the wallet extension is locked.
 *
 * Injected wallet APIs reject with an opaque payload in this state, which the
 * UI would otherwise surface as "request failed". Mapping it lets callers tell
 * the user to unlock the extension instead of offering an unhelpful retry.
 */
export class WalletLockedError extends Error {
  readonly code = 'WALLET_LOCKED';

  constructor(wallet: string, options?: { cause?: unknown }) {
    super(`${wallet} wallet is locked. Unlock the extension and try again.`, options);
    this.name = 'WalletLockedError';
  }
}

/** Reads a message out of the shapes extensions reject with. */
function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const { message, error } = err as { message?: unknown; error?: unknown };
    if (typeof message === 'string') return message;
    if (typeof error === 'string') return error;
  }
  return '';
}

/** True when an adapter failure says the extension has to be unlocked. */
export function isWalletLockedError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  return message.includes('locked') || message.includes('unlock');
}

/**
 * Maps a locked-extension failure onto `WalletLockedError`, or returns `null`
 * when the failure is unrelated so callers can rethrow their own value.
 */
export function toWalletLockedError(err: unknown, wallet: string): WalletLockedError | null {
  if (err instanceof WalletLockedError) return err;
  return isWalletLockedError(err) ? new WalletLockedError(wallet, { cause: err }) : null;
}

/** True when a signing failure came from the user dismissing the request. */
export function isUserRejection(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('user rejected') ||
    normalized.includes('declined') ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled')
  );
}

/**
 * Normalizes anything an adapter throws into a message safe to surface in the
 * UI, keeping the original error on `cause` for debugging.
 */
export function toSigningError(err: unknown, fallback: string): Error {
  // Adapter-classified errors already carry the type and `code` callers branch
  // on; re-wrapping them would drop both.
  if (
    err instanceof WalletRejectedError ||
    err instanceof WalletCancelledError ||
    err instanceof WalletLockedError
  ) {
    return err;
  }

  let message = fallback;
  if (err instanceof Error && err.message) {
    message = err.message;
  } else if (typeof err === 'string' && err) {
    message = err;
  }

  const error = new Error(message, { cause: err });
  return error;
}
