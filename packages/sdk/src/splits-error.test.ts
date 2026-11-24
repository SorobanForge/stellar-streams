import { describe, expect, it } from 'vitest';
import { SPLIT_ERROR_CODES, SplitsError } from './index.js';

describe('SPLIT_ERROR_CODES (#323)', () => {
  it('covers all SplitError discriminants from contracts/splits/src/lib.rs', () => {
    // Codes 1-10 from the Rust enum, including RecipientIndexOutOfBounds (9).
    const expected: Record<number, string> = {
      1: 'EmptyRecipients',
      2: 'LengthMismatch',
      3: 'InvalidShares',
      4: 'InvalidAmount',
      5: 'DuplicateRecipient',
      6: 'SplitNotFound',
      7: 'Unauthorized',
      8: 'ShareOverflow',
      9: 'RecipientIndexOutOfBounds',
      10: 'InvalidStateTransition',
    };
    expect(SPLIT_ERROR_CODES).toEqual(expected);
  });

  it('maps every code to a non-empty string name', () => {
    for (const [code, name] of Object.entries(SPLIT_ERROR_CODES)) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
      expect(Number(code)).toBeGreaterThan(0);
    }
  });
});

describe('SplitsError (#323)', () => {
  it('carries code and contractCode for a known error', () => {
    const err = new SplitsError('split failed: Error(Contract, #9)', 9);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(SplitsError);
    expect(err.name).toBe('SplitsError');
    expect(err.contractCode).toBe(9);
    expect(err.code).toBe('RecipientIndexOutOfBounds');
  });

  it('leaves code undefined for an unknown contract code', () => {
    const err = new SplitsError('unknown split error', 99);
    expect(err.contractCode).toBe(99);
    expect(err.code).toBeUndefined();
  });

  it('leaves both code and contractCode undefined when no code is given', () => {
    const err = new SplitsError('something went wrong');
    expect(err.code).toBeUndefined();
    expect(err.contractCode).toBeUndefined();
  });

  it('mirrors SplitError code 1 (EmptyRecipients)', () => {
    const err = new SplitsError('msg', 1);
    expect(err.code).toBe('EmptyRecipients');
  });

  it('mirrors SplitError code 8 (ShareOverflow)', () => {
    const err = new SplitsError('msg', 8);
    expect(err.code).toBe('ShareOverflow');
  });

  it('mirrors SplitError code 10 (InvalidStateTransition)', () => {
    const err = new SplitsError('msg', 10);
    expect(err.code).toBe('InvalidStateTransition');
  });
});
