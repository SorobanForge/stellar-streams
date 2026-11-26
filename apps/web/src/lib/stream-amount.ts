import { formatTokenAmount } from '@stellar-starter-kit/utils';

/**
 * The SEP-41 metadata the stream view needs to render an amount. Kept
 * structural so the SDK's `TokenMetadata` (which may carry more fields) can be
 * passed in unchanged.
 */
export interface StreamTokenMetadata {
  /** Token symbol, e.g. `XLM` or `USDC`. */
  symbol: string;
  /** Decimal places the token's smallest unit maps to. */
  decimals: number;
}

/** A formatted amount, with the token symbol when metadata was available. */
export type FormattedStreamAmount =
  | { value: string; symbol: string; isFallback: false }
  | { value: string; symbol: null; isFallback: true };

/**
 * Formats a raw on-chain stream amount for display using the token's own
 * `decimals`, so a USDC (6 decimals) stream is not shown with XLM's 7.
 *
 * Metadata can be missing (the SEP-41 read failed) or unusable (a `decimals`
 * value outside 0–38). Either way the view must still render: those cases fall
 * back to the raw base-unit value with `isFallback: true` so the caller can
 * show a warning instead of crashing. `formatTokenAmount` alone throws on an
 * invalid `decimals`, which is why the guard lives here.
 */
export function formatStreamAmount(
  raw: bigint | string,
  metadata: StreamTokenMetadata | null,
): FormattedStreamAmount {
  if (metadata) {
    try {
      return {
        value: formatTokenAmount(raw, metadata.decimals),
        symbol: metadata.symbol,
        isFallback: false,
      };
    } catch {
      // Unreadable metadata must not blank the stream view; fall through to the
      // raw value and let the caller warn.
    }
  }
  return { value: raw.toString(), symbol: null, isFallback: true };
}
