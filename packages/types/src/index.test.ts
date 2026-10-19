import { describe, it, expect } from 'vitest';
import {
  getStreamStatus,
  normalizeEscrow,
  normalizeSplit,
  normalizeStream,
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
    label: '',
    reference: '',
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

describe('domain normalizers', () => {
  it('normalizes stream contract fields and preserves large integers as strings', () => {
    expect(normalizeStream({
      id: 9_007_199_254_740_993n,
      sender: 'GSENDER', recipient: 'GRECIPIENT', token: 'CTOKEN',
      total_amount: 9_007_199_254_740_993n, withdrawn: 0n,
      start_time: 1n, end_time: 2n, cliff_time: 1n,
      label: '', reference: '', cancelled: false,
    })).toMatchObject({ id: '9007199254740993', totalAmount: '9007199254740993', startTime: 1 });
  });

  it('normalizes split field names and id', () => {
    expect(normalizeSplit({
      id: 9_007_199_254_740_993n, creator: 'GCREATOR', recipients: ['GONE'],
      shares: [10], total_shares: 10,
    })).toEqual({ id: '9007199254740993', creator: 'GCREATOR', recipients: ['GONE'], shares: [10], totalShares: 10 });
  });

  it('normalizes escrow integers and status names', () => {
    expect(normalizeEscrow({
      id: 9_007_199_254_740_993n, payer: 'GPAYER', payee: 'GPAYEE', arbiter: 'GARBITER',
      token: 'CTOKEN', amount: 170_141_183_460_469_231_731_687_303_715_884_105_727n,
      deadline: 9_007_199_254_740_993n, status: 1,
    })).toEqual({
      id: '9007199254740993', payer: 'GPAYER', payee: 'GPAYEE', arbiter: 'GARBITER', token: 'CTOKEN',
      amount: '170141183460469231731687303715884105727', deadline: '9007199254740993', status: 'funded',
    });
  });
});
