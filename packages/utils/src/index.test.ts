import { describe, it, expect } from 'vitest';
import {
  formatAddress,
  formatStroopsToXlm,
  parseXlmToStroops,
  formatDuration,
  computeVestedAmount,
  computeProgressBps,
  deriveStreamState,
  formatBps,
  formatTokenAmount,
  parseTokenAmount,
  XLM_DECIMALS,
  vestingCurve,
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

describe('deriveStreamState', () => {
  const stream = {
    totalAmount: '1000',
    withdrawn: '0',
    startTime: 1_000,
    endTime: 2_000,
    cliffTime: 1_500,
    cancelled: false,
  };

  it('cliff exactly at startTime: streaming at start, but nothing vested yet', () => {
    const atStart = deriveStreamState({ ...stream, cliffTime: 1_000 }, 1_000);
    expect(atStart).toEqual({
      status: 'streaming',
      progressBps: 0,
      claimable: 0n,
      remainingSeconds: 1_000,
    });

    const halfway = deriveStreamState({ ...stream, cliffTime: 1_000 }, 1_500);
    expect(halfway).toEqual({
      status: 'streaming',
      progressBps: 5_000,
      claimable: 500n,
      remainingSeconds: 500,
    });
  });

  it('cliff exactly at endTime: scheduled with zero progress until the last second', () => {
    const justBefore = deriveStreamState({ ...stream, cliffTime: 2_000 }, 1_999);
    expect(justBefore.status).toBe('scheduled');
    // Time-based progress alone would read 9990bps here — the shared path keeps
    // progress at 0 for exactly as long as the status says `scheduled`.
    expect(justBefore.progressBps).toBe(0);
    expect(justBefore.claimable).toBe(0n);
    expect(justBefore.remainingSeconds).toBe(1);

    const atEnd = deriveStreamState({ ...stream, cliffTime: 2_000 }, 2_000);
    expect(atEnd).toEqual({
      status: 'completed',
      progressBps: 10_000,
      claimable: 1_000n,
      remainingSeconds: 0,
    });
  });

  it('derives a cancelled stream as fully vested, mirroring the contract', () => {
    // `cancel` compresses the schedule on-chain (start = end = cliff = cancel time).
    const cancelled = deriveStreamState(
      {
        ...stream,
        totalAmount: '600',
        withdrawn: '100',
        startTime: 1_500,
        endTime: 1_500,
        cliffTime: 1_500,
        cancelled: true,
      },
      1_500,
    );
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.progressBps).toBe(10_000);
    expect(cancelled.claimable).toBe(500n); // 600 vested − 100 withdrawn
    expect(cancelled.remainingSeconds).toBe(0);
  });

  it('floors claimable at zero and remainingSeconds at zero', () => {
    const overWithdrawn = deriveStreamState(
      { ...stream, cliffTime: 1_000, withdrawn: '2000' },
      1_500,
    );
    expect(overWithdrawn.claimable).toBe(0n);

    const past = deriveStreamState(stream, 5_000);
    expect(past.remainingSeconds).toBe(0);
  });

  it('accepts bigint amounts as well as decimal strings', () => {
    const fromBigints = deriveStreamState(
      { ...stream, totalAmount: 1_000n, withdrawn: 0n, cliffTime: 1_000 },
      1_500,
    );
    expect(fromBigints.claimable).toBe(500n);
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

describe('vestingCurve', () => {
  it('returns { t, vested }[] including both endpoints and the exact cliff point', () => {
    const stream = {
      start: 1_000,
      cliff: 1_400,
      end: 2_000,
      deposit: 10_000n,
    };
    const curve = vestingCurve(stream, 10);

    // Endpoints
    expect(curve[0].t).toBe(1_000);
    expect(curve[0].vested).toBe(0n);

    expect(curve[curve.length - 1].t).toBe(2_000);
    expect(curve[curve.length - 1].vested).toBe(10_000n);

    // Exact cliff point exists
    const cliffPoint = curve.find((p) => p.t === 1_400);
    expect(cliffPoint).toBeDefined();
    // At cliff (t=1400, elapsed=400, duration=1000), 10_000 * 400 / 1000 = 4_000
    expect(cliffPoint!.vested).toBe(4_000n);

    // Points strictly before cliff are 0
    const beforeCliff = curve.filter((p) => p.t < 1_400);
    expect(beforeCliff.length).toBeGreaterThan(0);
    for (const p of beforeCliff) {
      expect(p.vested).toBe(0n);
    }
  });

  it('asserts monotonicity and that vested values never exceed the deposit', () => {
    const stream = {
      start: 100,
      cliff: 350,
      end: 1_000,
      deposit: 5_000n,
    };
    const curve = vestingCurve(stream, 25);

    expect(curve.length).toBeGreaterThanOrEqual(25);
    for (let i = 0; i < curve.length; i++) {
      // Never exceeds deposit
      expect(curve[i].vested).toBeLessThanOrEqual(5_000n);
      expect(curve[i].vested).toBeGreaterThanOrEqual(0n);

      if (i > 0) {
        // Monotonic non-decreasing vested values
        expect(curve[i].vested >= curve[i - 1].vested).toBe(true);
        // Strictly ascending timestamps
        expect(curve[i].t).toBeGreaterThan(curve[i - 1].t);
      }
    }
  });

  it('is pure and deterministic for a given input', () => {
    const stream = {
      start: 0,
      cliff: 200,
      end: 800,
      deposit: 1_000_000n,
    };
    const curve1 = vestingCurve(stream, 15);
    const curve2 = vestingCurve(stream, 15);

    expect(curve1).toEqual(curve2);
  });

  it('accepts both shorthand and formal VestingSchedule / Stream property names', () => {
    const shorthand = { start: 100, cliff: 300, end: 500, deposit: 2_000n };
    const formal = { startTime: 100, cliffTime: 300, endTime: 500, totalAmount: 2_000n };

    const curveShort = vestingCurve(shorthand, 10);
    const curveFormal = vestingCurve(formal, 10);

    expect(curveShort).toEqual(curveFormal);
  });

  it('handles string amounts and number deposits', () => {
    const fromString = vestingCurve({ start: 0, cliff: 100, end: 200, deposit: '5000' }, 5);
    const fromBigInt = vestingCurve({ start: 0, cliff: 100, end: 200, deposit: 5000n }, 5);
    const fromNumber = vestingCurve({ start: 0, cliff: 100, end: 200, deposit: 5000 }, 5);

    expect(fromString).toEqual(fromBigInt);
    expect(fromNumber).toEqual(fromBigInt);
  });

  it('handles cliff equal to start and cliff equal to end', () => {
    // Cliff at start
    const cliffAtStart = vestingCurve({ start: 0, cliff: 0, end: 100, deposit: 100n }, 5);
    expect(cliffAtStart[0].t).toBe(0);
    expect(cliffAtStart[cliffAtStart.length - 1].t).toBe(100);
    expect(cliffAtStart[cliffAtStart.length - 1].vested).toBe(100n);

    // Cliff at end
    const cliffAtEnd = vestingCurve({ start: 0, cliff: 100, end: 100, deposit: 100n }, 5);
    const endPoint = cliffAtEnd.find((p) => p.t === 100);
    expect(endPoint?.vested).toBe(100n);
    const midPoint = cliffAtEnd.find((p) => p.t < 100);
    if (midPoint) {
      expect(midPoint.vested).toBe(0n);
    }
  });

  it('handles edge case where start equals end', () => {
    const single = vestingCurve({ start: 500, cliff: 500, end: 500, deposit: 1_000n });
    expect(single).toEqual([{ t: 500, vested: 1_000n }]);
  });
});
