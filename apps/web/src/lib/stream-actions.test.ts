import { describe, expect, it } from 'vitest';
import {
  describeStreamActionError,
  parsePositiveTokenAmount,
  validateReduceTotal,
  validateTopUpAmount,
} from './stream-actions';

describe('parsePositiveTokenAmount', () => {
  it('scales a decimal input to the token smallest unit', () => {
    expect(parsePositiveTokenAmount('12.5', 7)).toBe(125_000_000n);
    expect(parsePositiveTokenAmount('1', 0)).toBe(1n);
  });

  it.each(['', '   ', '0', '0.0', '-3', 'abc', '.'])('rejects %j', (value) => {
    expect(parsePositiveTokenAmount(value, 7)).toBeNull();
  });
});

describe('validateTopUpAmount', () => {
  it('accepts a positive amount', () => {
    expect(validateTopUpAmount('25')).toBeNull();
    expect(validateTopUpAmount('0.0000001')).toBeNull();
  });

  it('requires an amount', () => {
    expect(validateTopUpAmount('')).toMatch(/enter an amount/i);
  });

  it.each(['0', '-5', 'ten', '1.2.3'])('rejects %j as non-positive', (value) => {
    expect(validateTopUpAmount(value)).toMatch(/positive number/i);
  });

  it('rejects a value that rounds to zero at the token precision', () => {
    expect(validateTopUpAmount('0.00000001')).toMatch(/positive number/i);
  });
});

describe('validateReduceTotal', () => {
  // The current total arrives from the chain in base units; the form input is
  // a display amount with the token's decimals.
  const currentTotal = 100_0000000n;

  it('accepts a total below the current total', () => {
    expect(validateReduceTotal('40', currentTotal)).toBeNull();
  });

  it('rejects a total equal to the current total', () => {
    expect(validateReduceTotal('100', currentTotal)).toMatch(/lower than the current total/i);
  });

  it('rejects a total above the current total', () => {
    expect(validateReduceTotal('150', currentTotal)).toMatch(/lower than the current total/i);
  });

  it('rejects an empty or non-positive total', () => {
    expect(validateReduceTotal('', currentTotal)).toMatch(/enter the new total/i);
    expect(validateReduceTotal('0', currentTotal)).toMatch(/positive number/i);
  });
});

describe('describeStreamActionError', () => {
  it('returns null when there is no error', () => {
    expect(describeStreamActionError(null)).toBeNull();
  });

  it('explains a REDUCTION_BELOW_VESTED rejection', () => {
    expect(
      describeStreamActionError(
        { message: 'Simulation failed: Error(Contract, #20)', code: 'REDUCTION_BELOW_VESTED' },
        'REDUCTION_BELOW_VESTED',
      ),
    ).toMatch(/below the amount that has already vested/i);
  });

  it('falls back to the raw message for an unknown code', () => {
    expect(describeStreamActionError({ message: 'RPC unavailable', code: 'SOMETHING_NEW' })).toBe(
      'RPC unavailable',
    );
  });

  it('accepts a plain message string', () => {
    expect(describeStreamActionError('Wallet rejected the request')).toBe(
      'Wallet rejected the request',
    );
  });
});
