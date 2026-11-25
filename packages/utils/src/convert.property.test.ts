import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatStroopsToXlm, parseXlmToStroops } from './index';

/**
 * Property-based coverage for the stroop/XLM round trip.
 *
 * The table tests in `index.test.ts` pin down hand-picked values; the generators
 * below sweep the whole 7-decimal space plus the very large amounts the
 * dashboard can encounter, which is where trimming and padding bugs hide.
 * `numRuns` is kept small on purpose: every iteration is pure bigint arithmetic,
 * so the file stays well under a second.
 */
const RUNS = 300;

/** 1 XLM in stroops (10^7). The formatter's trailing-zero trimming hinges on it. */
const ONE_XLM = 10_000_000n;

/** Amounts that sit exactly on a padding/trimming/sign boundary. */
const STROOP_EDGES = [
  0n,
  1n,
  ONE_XLM - 1n,
  ONE_XLM,
  ONE_XLM + 1n,
  123_456_789n,
  9_007_199_254_740_993n, // Number.MAX_SAFE_INTEGER + 2, where floats lose precision
];

/** Any stroop amount, from 0 to the `i128` ceiling (2^127 - 1). */
const anyStroops = fc.oneof(
  // The full 7-decimal range: every fraction length and every trimming case.
  { arbitrary: fc.bigInt({ min: 0n, max: ONE_XLM * 2n }), weight: 3 },
  // Long decimal amounts, including values past Number.MAX_SAFE_INTEGER.
  { arbitrary: fc.bigInt({ min: 0n, max: 10n ** 24n }), weight: 3 },
  // Signed amounts: `formatTokenAmount` supports negative balances and deltas.
  { arbitrary: fc.bigInt({ min: -(10n ** 24n), max: 0n }), weight: 2 },
  // Very large bigints, up to the contract's i128 maximum.
  { arbitrary: fc.bigInt({ min: 2n ** 100n, max: 2n ** 127n - 1n }), weight: 1 },
  // The hand-picked boundaries above.
  { arbitrary: fc.constantFrom(...STROOP_EDGES), weight: 2 },
);

/**
 * Canonical XLM decimal strings: no leading zeros, no `+`, at most 7 fractional
 * digits, and no trailing zeros — exactly what `formatStroopsToXlm` emits.
 */
const canonicalXlm = fc
  .tuple(
    fc.bigInt({ min: 0n, max: 10n ** 21n }),
    fc.option(fc.integer({ min: 1, max: 9_999_999 }), { nil: null }),
    fc.boolean(),
  )
  .map(([whole, fraction, negative]) => {
    // `-0` is not a canonical decimal string: formatStroopsToXlm(0n) is '0'.
    const sign = negative && (whole !== 0n || fraction !== null) ? '-' : '';
    // Trimming the trailing zeros keeps every generated string canonical.
    const decimals = fraction === null ? '' : `.${String(fraction).replace(/0+$/, '')}`;
    return `${sign}${whole}${decimals}`;
  });

describe('stroop/XLM conversion properties', () => {
  it('parseXlmToStroops(formatStroopsToXlm(x)) === x for any stroop amount', () => {
    fc.assert(
      fc.property(anyStroops, (stroops) => {
        // A failure names the counterexample in fast-check's report, and the
        // assertion below carries both operand values.
        expect(parseXlmToStroops(formatStroopsToXlm(stroops))).toBe(stroops);
      }),
      { numRuns: RUNS },
    );
  });

  it('formatStroopsToXlm(parseXlmToStroops(s)) === s for canonical decimals', () => {
    fc.assert(
      fc.property(canonicalXlm, (value) => {
        expect(formatStroopsToXlm(parseXlmToStroops(value))).toBe(value);
      }),
      { numRuns: RUNS },
    );
  });

  it('round-trips every stroop up to 10,000 and strides across the full range', () => {
    // Exhaustive for the small amounts, so no padding/trimming case is skipped.
    for (let stroops = 0n; stroops <= 10_000n; stroops += 1n) {
      expect(parseXlmToStroops(formatStroopsToXlm(stroops))).toBe(stroops);
    }
    // A prime stride spreads the samples across every 7-decimal position.
    for (let stroops = 10_000n; stroops <= ONE_XLM; stroops += 997n) {
      expect(parseXlmToStroops(formatStroopsToXlm(stroops))).toBe(stroops);
    }
    expect(parseXlmToStroops(formatStroopsToXlm(ONE_XLM))).toBe(ONE_XLM);
  });
});
