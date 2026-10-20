import { describe, expect, it } from 'vitest';
import { validateStreamInput } from './stream-validation';

describe('validateStreamInput', () => {
  it('accepts valid stream parameters', () => {
    expect(
      validateStreamInput({
        recipient: 'GC7JRTQX3BQZ2O2F5KEGLD5LM7NU3U7UAK2Z4JU44LBZOXP7T4XCRTM3',
        token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        amount: '100',
        durationDays: '30',
        cliffDays: '7',
      }),
    ).toEqual({});
  });

  it('rejects invalid recipient addresses', () => {
    expect(
      validateStreamInput({
        recipient: 'not-an-address',
        amount: '100',
        durationDays: '30',
        cliffDays: '0',
      }).recipient,
    ).toMatch(/valid Stellar account/i);
  });

  it('requires a positive amount and minimum duration', () => {
    expect(
      validateStreamInput({
        recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        amount: '0',
        durationDays: '0',
        cliffDays: '0',
      }).amount,
    ).toMatch(/positive number/i);

    expect(
      validateStreamInput({
        recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        amount: '100',
        durationDays: '0',
        cliffDays: '0',
      }).durationDays,
    ).toMatch(/at least 1 day/i);
  });

  it('rejects cliffs beyond the stream duration', () => {
    expect(
      validateStreamInput({
        recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        amount: '100',
        durationDays: '10',
        cliffDays: '12',
      }).cliffDays,
    ).toMatch(/cannot exceed/i);
  });
});
