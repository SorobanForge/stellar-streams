import { bench, describe } from 'vitest';
import { XLM_DECIMALS, parseTokenAmount, parseXlmToStroops } from './index';

/**
 * Benchmarks for the amount-parsing path. Run with:
 *
 *   pnpm --filter @stellar-starter-kit/utils bench
 *
 * The `legacy` implementations are the ones that shipped before the
 * optimisation, kept here so the before/after numbers stay reproducible instead
 * of living only in a pull-request description. They are benchmark-only code:
 * nothing at runtime imports them.
 */

/** The pre-optimisation parser: a regex plus `10n ** BigInt(decimals)` per call. */
function legacyParseTokenAmount(amount: string | number, decimals: number): bigint {
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

function legacyParseXlmToStroops(xlm: string | number): bigint {
  try {
    return legacyParseTokenAmount(xlm, XLM_DECIMALS);
  } catch {
    throw new Error(`Invalid XLM amount: ${String(xlm)}`);
  }
}

/** Representative inputs: typing digits, then amounts with full precision. */
const INPUTS = ['1', '10', '100', '1000', '12.5', '123.456789'];

describe('parseXlmToStroops (7 decimals)', () => {
  bench('current', () => {
    for (const input of INPUTS) parseXlmToStroops(input);
  });

  bench('legacy (regex + 10n ** BigInt(decimals))', () => {
    for (const input of INPUTS) legacyParseXlmToStroops(input);
  });
});

describe('parseTokenAmount', () => {
  bench('current (6 decimals)', () => {
    for (const input of INPUTS) parseTokenAmount(input, 6);
  });

  bench('legacy (6 decimals)', () => {
    for (const input of INPUTS) legacyParseTokenAmount(input, 6);
  });

  bench('current (18 decimals)', () => {
    for (const input of INPUTS) parseTokenAmount(input, 18);
  });

  bench('legacy (18 decimals)', () => {
    for (const input of INPUTS) legacyParseTokenAmount(input, 18);
  });
});
