import { describe, it, expect } from 'vitest';
import {
  formatAddress,
  formatStroopsToXlm,
  parseXlmToStroops,
  formatDuration,
  formatRelativeTime,
  computeVestedAmount,
  computeProgressBps,
  formatBps,
  formatTokenAmount,
  parseTokenAmount,
  XLM_DECIMALS,
} from './index';

describe('formatAddress', () => {
  it('shortens long public keys', () => {
    expect(formatAddress('GD3W5PQLX6Y6S7WLMCP6UFRT4N4IELKJD3X54V5A7LNLNEQ5Z6L4HJK3')).toBe(
      'GD3W...HJK3',
    );
  });

  it('returns short values unchanged', () => {
    expect(formatAddress('GD3W')).toBe('GD3W');
  });
});

describe('formatStroopsToXlm', () => {
  it('formats whole amounts', () => {
    expect(formatStroopsToXlm(10_000_000)).toBe('1');
    expect(formatStroopsToXlm('50000000')).toBe('5');
  });

  it('formats fractional amounts without trailing zeros', () => {
    expect(formatStroopsToXlm(BigInt(123_456_789))).toBe('12.3456789');
    expect(formatStroopsToXlm(1)).toBe('0.0000001');
  });

  it('preserves precision beyond Number.MAX_SAFE_INTEGER', () => {
    // 9007199254740993 stroops == 900719925.4740993 XLM
    expect(formatStroopsToXlm(9_007_199_254_740_993n)).toBe('900719925.4740993');
  });

  it('handles negatives', () => {
    expect(formatStroopsToXlm(-10_000_000)).toBe('-1');
  });
});

describe('parseXlmToStroops', () => {
  it('parses whole and fractional XLM', () => {
    expect(parseXlmToStroops('1')).toBe(10_000_000n);
    expect(parseXlmToStroops('0.0000001')).toBe(1n);
    expect(parseXlmToStroops(12.3456789)).toBe(123_456_789n);
  });

  it('truncates precision beyond 7 decimals', () => {
    expect(parseXlmToStroops('1.00000019')).toBe(10_000_001n);
  });

  it('round-trips with formatStroopsToXlm', () => {
    const stroops = 123_456_789n;
    expect(parseXlmToStroops(formatStroopsToXlm(stroops))).toBe(stroops);
  });

  it('rejects invalid input', () => {
    expect(() => parseXlmToStroops('abc')).toThrow();
    expect(() => parseXlmToStroops('')).toThrow();
    expect(() => parseXlmToStroops('.')).toThrow();
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes, hours and days', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(90)).toBe('1m');
    expect(formatDuration(3_661)).toBe('1h 1m');
    expect(formatDuration(90_061)).toBe('1d 1h 1m');
    expect(formatDuration(-5)).toBe('0s');
  });

  it('keeps exact day output through 7 days', () => {
    expect(formatDuration(6 * 86_400 + 3_600)).toBe('6d 1h');
    expect(formatDuration(7 * 86_400)).toBe('7d');
  });

  it('switches to weeks just past 7 days', () => {
    expect(formatDuration(8 * 86_400)).toBe('1w 1d');
    expect(formatDuration(7 * 86_400 + 1)).toBe('1w');
  });

  it('renders a year for 365 days', () => {
    expect(formatDuration(365 * 86_400)).toBe('1y');
  });

  it('renders only the two most significant units for long schedules', () => {
    expect(formatDuration(400 * 86_400)).toBe('1y 1mo');
    expect(formatDuration(382 * 86_400)).toBe('1y 2w');
    expect(formatDuration(8 * 86_400 + 5 * 3_600)).toBe('1w 1d');
  });
});

describe('formatRelativeTime', () => {
  // A fixed clock keeps every expectation below independent of the real date.
  const now = 1_700_000_000;

  it('describes future deltas', () => {
    expect(formatRelativeTime(now + 3 * 86_400, now)).toBe('in 3d');
    expect(formatRelativeTime(now + 2 * 3_600, now)).toBe('in 2h');
    expect(formatRelativeTime(now + 45 * 60, now)).toBe('in 45m');
  });

  it('describes past deltas', () => {
    expect(formatRelativeTime(now - 2 * 3_600, now)).toBe('2h ago');
    expect(formatRelativeTime(now - 7 * 86_400, now)).toBe('7d ago');
    expect(formatRelativeTime(now - 90 * 60, now)).toBe('1h ago');
  });

  it('collapses sub-minute and zero deltas to "just now"', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 59, now)).toBe('just now');
    expect(formatRelativeTime(now + 59, now)).toBe('just now');
  });

  it('rounds down to the largest whole unit', () => {
    expect(formatRelativeTime(now + 60, now)).toBe('in 1m');
    expect(formatRelativeTime(now + 86_400, now)).toBe('in 1d');
    expect(formatRelativeTime(now + 10 * 86_400 + 5 * 3_600, now)).toBe('in 10d');
  });

  it('is deterministic for a fixed now', () => {
    // The same inputs always produce the same string: the helper never reads
    // the clock itself, so a UI clock change cannot move the boundary.
    const endTime = now + 3 * 86_400;
    expect(formatRelativeTime(endTime, now)).toBe(formatRelativeTime(endTime, now));
    expect(formatRelativeTime(endTime, now + 1)).toBe('in 2d');
  });

  it('handles negative and zero deltas without throwing', () => {
    expect(() => formatRelativeTime(0, 0)).not.toThrow();
    expect(() => formatRelativeTime(-1, 0)).not.toThrow();
    expect(formatRelativeTime(Number.NaN, now)).toBe('just now');
    expect(formatRelativeTime(now, Number.POSITIVE_INFINITY)).toBe('just now');
  });
});

describe('vesting math', () => {
  const schedule = {
    totalAmount: 1_000n,
    startTime: 0,
    endTime: 1_000,
    cliffTime: 0,
  };

  it('returns 0 before the cliff', () => {
    expect(computeVestedAmount({ ...schedule, cliffTime: 400 }, 399)).toBe(0n);
  });

  it('vests linearly', () => {
    expect(computeVestedAmount(schedule, 0)).toBe(0n);
    expect(computeVestedAmount(schedule, 250)).toBe(250n);
    expect(computeVestedAmount(schedule, 500)).toBe(500n);
    expect(computeVestedAmount(schedule, 1_000)).toBe(1_000n);
    expect(computeVestedAmount(schedule, 5_000)).toBe(1_000n);
  });

  it('computes progress in basis points', () => {
    expect(computeProgressBps(schedule, 0)).toBe(0);
    expect(computeProgressBps(schedule, 500)).toBe(5_000);
    expect(computeProgressBps(schedule, 1_000)).toBe(10_000);
    expect(formatBps(5_000)).toBe('50%');
    expect(formatBps(2_550)).toBe('25.5%');
  });
});

describe('formatTokenAmount', () => {
  it('formats a 6-decimal token (e.g. USDC)', () => {
    expect(formatTokenAmount(1_000_000n, 6)).toBe('1');
    expect(formatTokenAmount('1234567', 6)).toBe('1.234567');
    expect(formatTokenAmount(1, 6)).toBe('0.000001');
  });

  it('formats an 18-decimal token beyond Number.MAX_SAFE_INTEGER', () => {
    expect(formatTokenAmount(1_500_000_000_000_000_000n, 18)).toBe('1.5');
  });

  it('formats a 0-decimal token', () => {
    expect(formatTokenAmount(42n, 0)).toBe('42');
  });

  it('matches formatStroopsToXlm for XLM_DECIMALS', () => {
    expect(formatTokenAmount(123_456_789n, XLM_DECIMALS)).toBe(formatStroopsToXlm(123_456_789n));
  });

  it('handles negatives', () => {
    expect(formatTokenAmount(-1_500_000n, 6)).toBe('-1.5');
  });

  it('rejects invalid decimals', () => {
    expect(() => formatTokenAmount(1n, -1)).toThrow('Invalid token decimals');
    expect(() => formatTokenAmount(1n, 1.5)).toThrow('Invalid token decimals');
    expect(() => formatTokenAmount(1n, 39)).toThrow('Invalid token decimals');
  });
});

describe('parseTokenAmount', () => {
  it('parses using the token decimals', () => {
    expect(parseTokenAmount('1.5', 6)).toBe(1_500_000n);
    expect(parseTokenAmount('1', 18)).toBe(10n ** 18n);
    expect(parseTokenAmount('7', 0)).toBe(7n);
  });

  it('truncates precision beyond the token decimals', () => {
    expect(parseTokenAmount('1.0000019', 6)).toBe(1_000_001n);
    expect(parseTokenAmount('1.9', 0)).toBe(1n);
  });

  it('round-trips with formatTokenAmount', () => {
    for (const decimals of [0, 2, 6, 7, 18]) {
      const raw = 123_456_789_012n;
      expect(parseTokenAmount(formatTokenAmount(raw, decimals), decimals)).toBe(raw);
    }
  });

  it('rejects invalid input', () => {
    expect(() => parseTokenAmount('abc', 6)).toThrow('Invalid token amount');
    expect(() => parseTokenAmount('1', -1)).toThrow('Invalid token decimals');
  });
});
