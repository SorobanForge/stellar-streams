import { describe, expect, it } from 'vitest';
import { formatStreamAmount } from './stream-amount';

describe('formatStreamAmount', () => {
  it('formats a 7-decimal token with its symbol (XLM)', () => {
    expect(formatStreamAmount(10_000_000n, { symbol: 'XLM', decimals: 7 })).toEqual({
      value: '1',
      symbol: 'XLM',
      isFallback: false,
    });
  });

  it('formats a 6-decimal token with its symbol (USDC)', () => {
    expect(formatStreamAmount('1500000', { symbol: 'USDC', decimals: 6 })).toEqual({
      value: '1.5',
      symbol: 'USDC',
      isFallback: false,
    });
  });

  it('formats a 0-decimal token without inventing a fraction', () => {
    expect(formatStreamAmount(42n, { symbol: 'PTS', decimals: 0 })).toEqual({
      value: '42',
      symbol: 'PTS',
      isFallback: false,
    });
  });

  it('falls back to the raw base-unit value when metadata is missing', () => {
    expect(formatStreamAmount(10_000_000n, null)).toEqual({
      value: '10000000',
      symbol: null,
      isFallback: true,
    });
  });

  it('falls back instead of throwing when the decimals are unusable', () => {
    expect(formatStreamAmount(10_000_000n, { symbol: 'BAD', decimals: 40 })).toEqual({
      value: '10000000',
      symbol: null,
      isFallback: true,
    });
  });
});
