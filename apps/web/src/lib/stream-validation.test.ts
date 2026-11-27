import { describe, expect, it } from 'vitest';
import { validateStreamInput } from './stream-validation';
import {
  CLIFF_OUTSIDE_WINDOW_MESSAGE,
  PAST_START_MESSAGE,
  ZERO_DURATION_MESSAGE,
  isStreamScheduleValid,
  validateStreamSchedule,
} from './stream-schedule-validation';

const NOW = 1_000_000;

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

describe('validateStreamSchedule', () => {
  const start = NOW + 100;
  const end = start + 30 * 86_400;

  it.each([
    {
      name: 'cliff equal to the start (no cliff)',
      schedule: { startTime: start, endTime: end, cliffTime: start },
      errors: {},
    },
    {
      name: 'cliff equal to the end (fully locked)',
      schedule: { startTime: start, endTime: end, cliffTime: end },
      errors: {},
    },
    {
      name: 'cliff in the middle of the window',
      schedule: { startTime: start, endTime: end, cliffTime: start + 7 * 86_400 },
      errors: {},
    },
    {
      name: 'cliff before the start',
      schedule: { startTime: start, endTime: end, cliffTime: start - 1 },
      errors: { cliffTime: CLIFF_OUTSIDE_WINDOW_MESSAGE },
    },
    {
      name: 'cliff after the end',
      schedule: { startTime: start, endTime: end, cliffTime: end + 1 },
      errors: { cliffTime: CLIFF_OUTSIDE_WINDOW_MESSAGE },
    },
    {
      name: 'zero-length window',
      schedule: { startTime: start, endTime: start, cliffTime: start },
      errors: { endTime: ZERO_DURATION_MESSAGE },
    },
    {
      name: 'end before the start',
      schedule: { startTime: start, endTime: start - 1, cliffTime: start },
      errors: { endTime: ZERO_DURATION_MESSAGE },
    },
    {
      name: 'start in the past',
      schedule: { startTime: NOW - 1, endTime: end, cliffTime: NOW - 1 },
      errors: { startTime: PAST_START_MESSAGE },
    },
    {
      name: 'start equal to now is accepted',
      schedule: { startTime: NOW, endTime: end, cliffTime: NOW },
      errors: {},
    },
    {
      name: 'non-finite timestamps',
      schedule: { startTime: Number.NaN, endTime: Number.NaN, cliffTime: Number.NaN },
      errors: { startTime: PAST_START_MESSAGE, endTime: ZERO_DURATION_MESSAGE },
    },
  ])('$name', ({ schedule, errors }) => {
    expect(validateStreamSchedule(schedule, NOW)).toEqual(errors);
  });

  it('accepts a valid schedule through the boolean helper', () => {
    expect(
      isStreamScheduleValid({ startTime: start, endTime: end, cliffTime: start + 1 }, NOW),
    ).toBe(true);
    expect(isStreamScheduleValid({ startTime: start, endTime: start, cliffTime: start }, NOW)).toBe(
      false,
    );
  });

  it('uses the documented message wording', () => {
    expect(PAST_START_MESSAGE).toBe('Start time cannot be in the past.');
    expect(ZERO_DURATION_MESSAGE).toBe('Stream duration must be greater than zero.');
    expect(CLIFF_OUTSIDE_WINDOW_MESSAGE).toBe(
      'Cliff must fall between the start and end of the stream.',
    );
  });
});
