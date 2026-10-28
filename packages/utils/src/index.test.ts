import { describe, it, expect } from 'vitest';
import {
  formatAddress,
  formatStroopsToXlm,
  parseXlmToStroops,
  mulDiv,
  formatDuration,
  formatRelativeTime,
  computeVestedAmount,
  computeClaimable,
  computeProtocolFee,
  computeProgressBps,
  formatBps,
  formatTokenAmount,
  parseTokenAmount,
  XLM_DECIMALS,
  toCsv,
  vestingCurve,
  type ClaimableStream,
} from './index';

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && csv[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('Unterminated quoted CSV field');
  row.push(field);
  rows.push(row);
  return rows;
}

describe('toCsv', () => {
  it('escapes commas, quotes, and newlines using RFC 4180 quoting', () => {
    const csv = toCsv([{ label: 'A, B', note: 'Said "hello"\r\nnext line' }], ['label', 'note']);

    expect(csv).toBe('label,note\r\n"A, B","Said ""hello""\r\nnext line"');
  });

  it('keeps caller column order and round-trips large decimal amounts', () => {
    const amount = '170141183460469231731687303715884105727';
    const csv = toCsv(
      [{ id: 'stream-1', totalAmount: amount, withdrawn: 9_007_199_254_740_993n }],
      ['totalAmount', 'id', 'withdrawn'],
    );

    expect(parseCsv(csv)).toEqual([
      ['totalAmount', 'id', 'withdrawn'],
      [amount, 'stream-1', '9007199254740993'],
    ]);
  });

  it('returns the requested header when there are no streams', () => {
    expect(toCsv<{ id: string; totalAmount: string }>([], ['id', 'totalAmount'])).toBe(
      'id,totalAmount',
    );
  });
});

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

describe('parseXlmToStroops malformed-input table', () => {
  const malformed =
    'Expected a plain decimal number such as "1.5" (scientific notation, NaN and Infinity are not supported).';
  const nonFinite = 'Expected a finite decimal number (e.g. "1.5").';

  const cases: Array<{
    label: string;
    input: string | number;
    expected?: bigint;
    error?: string;
  }> = [
    {
      label: 'rejects scientific notation supplied as a string',
      input: '1e7',
      error: `Invalid XLM amount: "1e7". ${malformed}`,
    },
    {
      label: 'rejects the Infinity string',
      input: 'Infinity',
      error: `Invalid XLM amount: "Infinity". ${malformed}`,
    },
    {
      label: 'trims surrounding whitespace',
      input: ' 1.2 ',
      expected: 12_000_000n,
    },
    { label: 'accepts a leading decimal point', input: '.5', expected: 5_000_000n },
    { label: 'accepts a trailing decimal point', input: '1.', expected: 10_000_000n },
    {
      label: 'truncates sub-stroop precision toward zero',
      input: '-0.00000001',
      expected: 0n,
    },
    {
      label: 'truncates positive sub-stroop precision to zero',
      input: '0.00000001',
      expected: 0n,
    },
    { label: 'parses the smallest positive stroop', input: '0.0000001', expected: 1n },
    {
      label: 'expands exponential notation from number inputs',
      input: 1e7,
      // 1e7 is ten million XLM, not scientific notation for one XLM.
      expected: 100_000_000_000_000n,
    },
    {
      label: 'parses small numeric values without exponential-notation errors',
      input: 0.0000001,
      expected: 1n,
    },
    {
      label: 'truncates negative sub-stroop number inputs like strings',
      input: -0.00000001,
      expected: 0n,
    },
    {
      label: 'rejects NaN with a finite-number message',
      input: NaN,
      error: `Invalid XLM amount: NaN. ${nonFinite}`,
    },
    {
      label: 'rejects Infinity with a finite-number message',
      input: Infinity,
      error: `Invalid XLM amount: Infinity. ${nonFinite}`,
    },
    {
      label: 'rejects -Infinity with a finite-number message',
      input: -Infinity,
      error: `Invalid XLM amount: -Infinity. ${nonFinite}`,
    },
    {
      label: 'rejects an empty string',
      input: '',
      error: `Invalid XLM amount: "". ${malformed}`,
    },
    {
      label: 'rejects a lone decimal point',
      input: '.',
      error: `Invalid XLM amount: ".". ${malformed}`,
    },
    {
      label: 'rejects a lone minus sign',
      input: '-',
      error: `Invalid XLM amount: "-". ${malformed}`,
    },
    {
      label: 'rejects multiple decimal points',
      input: '1.2.3',
      error: `Invalid XLM amount: "1.2.3". ${malformed}`,
    },
    {
      label: 'rejects thousands separators',
      input: '1,000',
      error: `Invalid XLM amount: "1,000". ${malformed}`,
    },
  ];

  it.each(cases)('$label', ({ input, expected, error }) => {
    if (error !== undefined) {
      expect(() => parseXlmToStroops(input)).toThrowError(error);
    } else {
      expect(parseXlmToStroops(input)).toBe(expected);
    }
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

describe('claimable and protocol-fee math', () => {
  const baseStream: ClaimableStream = {
    totalAmount: '1000',
    withdrawn: '0',
    startTime: 0,
    endTime: 1_000,
    cliffTime: 0,
  };

  const now = (seconds: number) => ({ stream: baseStream, now: seconds });

  it('computes claimable as vested minus withdrawn', () => {
    // vested(500) = 1000 * 500 / 1000 = 500; withdrawn = 0
    expect(computeClaimable({ ...now(500).stream, withdrawn: '0' }, 500)).toBe(500n);
    // fully vested: vested(1000) = 1000; withdrawn = 0
    expect(computeClaimable({ ...now(1000).stream, withdrawn: '0' }, 1000)).toBe(1000n);
  });

  it('returns 0 when nothing is vested yet', () => {
    expect(computeClaimable({ ...now(0).stream, withdrawn: '0' }, 0)).toBe(0n);
    expect(computeClaimable({ ...now(-100).stream, withdrawn: '0' }, -100)).toBe(0n);
  });

  it('returns 0 when previously withdrawn funds exceed vested', () => {
    expect(computeClaimable({ ...now(500).stream, withdrawn: '600' }, 500)).toBe(0n);
    expect(computeClaimable({ ...now(500).stream, withdrawn: '500' }, 500)).toBe(0n);
  });

  it('handles a stream with previously withdrawn funds', () => {
    // vested(500) = 500; withdrawn = 300; claimable = 200
    expect(computeClaimable({ ...now(500).stream, withdrawn: '300' }, 500)).toBe(200n);
  });

  it('handles a partially vested stream', () => {
    // vested(250) = 1000 * 250 / 1000 = 250; withdrawn = 0
    expect(computeClaimable({ ...now(250).stream, withdrawn: '0' }, 250)).toBe(250n);
  });

  it('applies integer truncation to vesting', () => {
    // totalAmount = 1, end = 3: vested(1) = 1 * 1 / 3 = 0 (truncated)
    const small = { ...baseStream, totalAmount: '1', endTime: 3 };
    expect(computeClaimable({ ...small, withdrawn: '0' }, 1)).toBe(0n);
    // totalAmount = 5, end = 2: vested(1) = 5 * 1 / 2 = 2 (2.5 truncated)
    const small2 = { ...baseStream, totalAmount: '5', endTime: 2 };
    expect(computeClaimable({ ...small2, withdrawn: '0' }, 1)).toBe(2n);
  });

  it('computes a 250 bps protocol fee', () => {
    // 1000 * 250 / 10_000 = 25
    expect(computeProtocolFee(1000n, 250)).toBe(25n);
  });

  it('computes a zero protocol fee', () => {
    expect(computeProtocolFee(1000n, 0)).toBe(0n);
    expect(computeProtocolFee(0n, 250)).toBe(0n);
  });

  it('truncates small protocol fees toward zero', () => {
    // 7 * 250 / 10_000 = 1750 / 10_000 = 0 (truncated)
    expect(computeProtocolFee(7n, 250)).toBe(0n);
    // 9999 * 1 / 10_000 = 0 (truncated)
    expect(computeProtocolFee(9999n, 1)).toBe(0n);
    // 10000 * 1 / 10_000 = 1
    expect(computeProtocolFee(10000n, 1)).toBe(1n);
  });

  it('computes the max 1000 bps fee', () => {
    // 1000 * 1000 / 10_000 = 100
    expect(computeProtocolFee(1000n, 1_000)).toBe(100n);
  });

  it('derives net claimable as claimable minus fee', () => {
    const claimable = computeClaimable({ ...now(500).stream, withdrawn: '0' }, 500); // 500
    const fee = computeProtocolFee(claimable, 250); // 500 * 250 / 10_000 = 12
    expect(fee).toBe(12n);
    expect(claimable - fee).toBe(488n);
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

describe('mulDiv', () => {
  it('returns floor of a*b/c for small values', () => {
    expect(mulDiv(10n, 3n, 4n)).toBe(7n);
  });

  it('throws on division by zero', () => {
    expect(() => mulDiv(1n, 2n, 0n)).toThrow('mulDiv: division by zero');
  });

  it('handles values near i128 bounds', () => {
    const max = 2n ** 127n - 1n;
    expect(mulDiv(max, 1n, 1n)).toBe(max);
    expect(mulDiv(max, 2n, 2n)).toBe(max);
  });

  it('handles remainder division with floor semantics', () => {
    expect(mulDiv(7n, 1n, 2n)).toBe(3n);
    expect(mulDiv(100n, 33n, 7n)).toBe(471n);
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

    expect(curve[0].t).toBe(1_000);
    expect(curve[0].vested).toBe(0n);

    expect(curve[curve.length - 1].t).toBe(2_000);
    expect(curve[curve.length - 1].vested).toBe(10_000n);

    const cliffPoint = curve.find((p) => p.t === 1_400);
    expect(cliffPoint).toBeDefined();
    expect(cliffPoint!.vested).toBe(4_000n);

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
      expect(curve[i].vested).toBeLessThanOrEqual(5_000n);
      expect(curve[i].vested).toBeGreaterThanOrEqual(0n);

      if (i > 0) {
        expect(curve[i].vested >= curve[i - 1].vested).toBe(true);
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
    const cliffAtStart = vestingCurve({ start: 0, cliff: 0, end: 100, deposit: 100n }, 5);
    expect(cliffAtStart[0].t).toBe(0);
    expect(cliffAtStart[cliffAtStart.length - 1].t).toBe(100);
    expect(cliffAtStart[cliffAtStart.length - 1].vested).toBe(100n);

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
