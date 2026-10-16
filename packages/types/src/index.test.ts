import { describe, it, expect } from 'vitest';
import {
  ContractShapeError,
  getStreamStatus,
  isConfig,
  isEscrow,
  isSplit,
  isStream,
  normalizeConfig,
  normalizeEscrow,
  normalizeSplit,
  normalizeStream,
  type RawConfig,
  type RawEscrow,
  type RawSplit,
  type RawStream,
  type Stream,
} from './index';

const START = 1_000;
const CLIFF = 1_500;
const END = 2_000;

function makeStream(overrides: Partial<Stream> = {}): Stream {
  return {
    id: '1',
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKEN',
    totalAmount: '1000000000',
    withdrawn: '0',
    startTime: START,
    endTime: END,
    cliffTime: CLIFF,
    cancelled: false,
    ...overrides,
  };
}

describe('getStreamStatus', () => {
  describe('cancelled', () => {
    it.each([
      ['before start', START - 1],
      ['at start', START],
      ['inside the cliff', CLIFF - 1],
      ['between cliff and end', CLIFF + 1],
      ['at end', END],
      ['after end', END + 1_000],
    ])('is cancelled %s, regardless of time', (_label, now) => {
      expect(getStreamStatus(makeStream({ cancelled: true }), now)).toBe('cancelled');
    });

    it('reports cancelled (not completed) when cancelled after the stream completed', () => {
      // A sender can only cancel before end on-chain, but the flag must still take
      // precedence over the time-derived status so the dashboard never shows a
      // withdrawable "completed" badge for a cancelled stream.
      const stream = makeStream({ cancelled: true, withdrawn: '1000000000' });
      expect(getStreamStatus(stream, END)).toBe('cancelled');
      expect(getStreamStatus(stream, END + 1)).toBe('cancelled');
    });
  });

  describe('before start', () => {
    it('is scheduled well before start', () => {
      expect(getStreamStatus(makeStream(), 0)).toBe('scheduled');
    });

    it('is scheduled one second before start', () => {
      expect(getStreamStatus(makeStream(), START - 1)).toBe('scheduled');
    });

    it('is streaming exactly at start when there is no cliff', () => {
      expect(getStreamStatus(makeStream({ cliffTime: START }), START)).toBe('streaming');
    });
  });

  describe('inside the cliff', () => {
    it('is scheduled at start when the cliff is later', () => {
      expect(getStreamStatus(makeStream(), START)).toBe('scheduled');
    });

    it('is scheduled one second before the cliff', () => {
      expect(getStreamStatus(makeStream(), CLIFF - 1)).toBe('scheduled');
    });
  });

  describe('between cliff and end', () => {
    it('is streaming exactly at the cliff', () => {
      expect(getStreamStatus(makeStream(), CLIFF)).toBe('streaming');
    });

    it('is streaming between cliff and end', () => {
      expect(getStreamStatus(makeStream(), CLIFF + 1)).toBe('streaming');
      expect(getStreamStatus(makeStream(), END - 1)).toBe('streaming');
    });
  });

  describe('at and after end', () => {
    it('is completed exactly at end', () => {
      expect(getStreamStatus(makeStream(), END)).toBe('completed');
    });

    it('is completed after end', () => {
      expect(getStreamStatus(makeStream(), END + 1)).toBe('completed');
    });

    it('is completed at end even when the cliff equals the end', () => {
      expect(getStreamStatus(makeStream({ cliffTime: END }), END)).toBe('completed');
    });
  });
});

describe('normalizeStream', () => {
  it('converts the snake_case bigint fields into the camelCase domain shape', () => {
    const raw: RawStream = {
      id: 1n,
      sender: 'GSENDER',
      recipient: 'GRECIPIENT',
      token: 'CTOKEN',
      total_amount: 1_000_000_000n,
      withdrawn: 250n,
      start_time: 1_000n,
      end_time: 2_000n,
      cliff_time: 1_500n,
      cancelled: false,
    };
    expect(normalizeStream(raw)).toEqual(makeStream({ withdrawn: '250' }));
  });
});

function makeRawEscrow(overrides: Partial<RawEscrow> = {}): RawEscrow {
  return {
    id: 1n,
    payer: 'GPAYER',
    payee: 'GPAYEE',
    arbiter: 'GARBITER',
    token: 'CTOKEN',
    amount: 10_000_000_000n,
    deadline: 2_000n,
    status: 1,
    ...overrides,
  };
}

describe('normalizeEscrow', () => {
  it('converts the u64 / i128 fields to decimal strings', () => {
    expect(normalizeEscrow(makeRawEscrow())).toEqual({
      id: '1',
      payer: 'GPAYER',
      payee: 'GPAYEE',
      arbiter: 'GARBITER',
      token: 'CTOKEN',
      amount: '10000000000',
      deadline: '2000',
      status: 'funded',
    });
  });

  it.each([
    [0, 'created'],
    [1, 'funded'],
    [2, 'released'],
    [3, 'refunded'],
    [4, 'cancelled'],
  ])('maps status code %i to %s', (code, status) => {
    expect(normalizeEscrow(makeRawEscrow({ status: code })).status).toBe(status);
  });

  it('keeps u64 ids beyond the safe integer range exact', () => {
    const escrow = normalizeEscrow(makeRawEscrow({ id: 9_007_199_254_740_993n }));
    expect(escrow.id).toBe('9007199254740993');
  });

  it('rejects a status code the contract does not define', () => {
    expect(() => normalizeEscrow(makeRawEscrow({ status: 5 }))).toThrow('Unknown escrow status: 5');
  });
});

function makeRawSplit(overrides: Partial<RawSplit> = {}): RawSplit {
  return {
    id: 7n,
    creator: 'GCREATOR',
    recipients: ['GRECIPIENT1', 'GRECIPIENT2'],
    shares: [70, 30],
    total_shares: 100,
    ...overrides,
  };
}

describe('normalizeSplit', () => {
  it('converts the id to a decimal string and renames total_shares', () => {
    expect(normalizeSplit(makeRawSplit())).toEqual({
      id: '7',
      creator: 'GCREATOR',
      recipients: ['GRECIPIENT1', 'GRECIPIENT2'],
      shares: [70, 30],
      totalShares: 100,
    });
  });

  it('copies the recipient and share arrays instead of aliasing them', () => {
    const raw = makeRawSplit();
    const split = normalizeSplit(raw);
    split.recipients.push('GEXTRA');
    split.shares.push(1);
    expect(raw.recipients).toHaveLength(2);
    expect(raw.shares).toHaveLength(2);
  });
});

function makeRawStream(overrides: Partial<RawStream> = {}): RawStream {
  return {
    id: 1n,
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKEN',
    total_amount: 1_000_000_000n,
    withdrawn: 250n,
    start_time: 1_000n,
    end_time: 2_000n,
    cliff_time: 1_500n,
    cancelled: false,
    ...overrides,
  };
}

function makeRawConfig(overrides: Partial<RawConfig> = {}): RawConfig {
  return { admin: 'GADMIN', treasury: 'GTREASURY', fee_bps: 30, ...overrides };
}

/** Runs `fn` and returns the error it threw, or `undefined` when it did not throw. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('runtime guards', () => {
  it('accepts valid payloads for every entity', () => {
    expect(isStream(makeRawStream())).toBe(true);
    expect(isConfig(makeRawConfig())).toBe(true);
    expect(isEscrow(makeRawEscrow())).toBe(true);
    expect(isSplit(makeRawSplit())).toBe(true);
  });

  it('rejects payloads with a missing field', () => {
    const withoutCliff: Partial<RawStream> = { ...makeRawStream() };
    delete withoutCliff.cliff_time;
    expect(isStream(withoutCliff)).toBe(false);

    const withoutFeeBps: Partial<RawConfig> = { admin: 'GADMIN', treasury: 'GTREASURY' };
    expect(isConfig(withoutFeeBps)).toBe(false);

    const withoutDeadline: Partial<RawEscrow> = { ...makeRawEscrow() };
    delete withoutDeadline.deadline;
    expect(isEscrow(withoutDeadline)).toBe(false);

    const withoutTotalShares: Partial<RawSplit> = { ...makeRawSplit() };
    delete withoutTotalShares.total_shares;
    expect(isSplit(withoutTotalShares)).toBe(false);
  });

  it('rejects wrong-typed fields', () => {
    // Decimal string where the contract decodes a u64 / i128 as bigint.
    expect(isStream({ ...makeRawStream(), total_amount: '1000000000' })).toBe(false);
    expect(isStream({ ...makeRawStream(), cancelled: 'false' })).toBe(false);
    expect(isConfig({ ...makeRawConfig(), fee_bps: '30' })).toBe(false);
    expect(isEscrow({ ...makeRawEscrow(), status: '1' })).toBe(false);
    expect(isSplit({ ...makeRawSplit(), recipients: ['GRECIPIENT1', 42] })).toBe(false);
    expect(isSplit({ ...makeRawSplit(), shares: [70, '30'] })).toBe(false);
  });

  it('rejects payloads that are not objects at all', () => {
    expect(isStream(null)).toBe(false);
    expect(isStream(undefined)).toBe(false);
    expect(isStream('Stream')).toBe(false);
    expect(isEscrow(7)).toBe(false);
  });
});

describe('normalizers call the guards', () => {
  it('throws ContractShapeError naming the missing field', () => {
    const broken: Partial<RawStream> = { ...makeRawStream() };
    delete broken.total_amount;

    const error = caught(() => normalizeStream(broken as RawStream));
    expect(error).toBeInstanceOf(ContractShapeError);
    const shape = error as ContractShapeError;
    expect(shape.name).toBe('ContractShapeError');
    expect(shape.entity).toBe('Stream');
    expect(shape.field).toBe('total_amount');
    expect(shape.message).toContain('"total_amount"');
    expect(shape.message).toContain('expected bigint');
  });

  it('names a wrong-typed config field', () => {
    const error = caught(() =>
      normalizeConfig({ ...makeRawConfig(), fee_bps: '30' } as unknown as RawConfig),
    );
    expect(error).toBeInstanceOf(ContractShapeError);
    const shape = error as ContractShapeError;
    expect(shape.entity).toBe('Config');
    expect(shape.field).toBe('fee_bps');
  });

  it('names a missing escrow field', () => {
    const broken: Partial<RawEscrow> = { ...makeRawEscrow() };
    delete broken.deadline;

    const error = caught(() => normalizeEscrow(broken as RawEscrow));
    expect(error).toBeInstanceOf(ContractShapeError);
    const shape = error as ContractShapeError;
    expect(shape.entity).toBe('Escrow');
    expect(shape.field).toBe('deadline');
  });

  it('names a wrong-typed split field', () => {
    const error = caught(() =>
      normalizeSplit({ ...makeRawSplit(), total_shares: '100' } as unknown as RawSplit),
    );
    expect(error).toBeInstanceOf(ContractShapeError);
    const shape = error as ContractShapeError;
    expect(shape.entity).toBe('Split');
    expect(shape.field).toBe('total_shares');
  });

  it('passes valid payloads straight through to conversion', () => {
    expect(normalizeStream(makeRawStream()).id).toBe('1');
    expect(normalizeConfig(makeRawConfig()).feeBps).toBe(30);
    expect(normalizeEscrow(makeRawEscrow()).status).toBe('funded');
    expect(normalizeSplit(makeRawSplit()).totalShares).toBe(100);
  });

  it('keeps throwing the status-range error after the guard passes', () => {
    expect(() => normalizeEscrow(makeRawEscrow({ status: 5 }))).toThrow('Unknown escrow status: 5');
  });
});
