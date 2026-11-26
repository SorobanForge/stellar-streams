import { describe, expect, it, vi } from 'vitest';
import { StrKey } from 'stellar-sdk';
import { EscrowError } from '@stellar-starter-kit/sdk';
import { normalizeEscrowSchedule, type Escrow } from '@stellar-starter-kit/types';
import {
  allocatedMilestoneAmount,
  amountToBaseUnits,
  describeWizardStep,
  formatEscrowAmount,
  getLiveEscrowTotals,
  getReleaseEligibility,
  nextReleasableMilestone,
  parseDeadlineValue,
  probeMilestoneSupport,
  splitEvenly,
  toDeadlineValue,
  validateEscrowDetails,
  validateMilestoneSchedule,
} from './escrow-milestones';

const RECIPIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const ARBITER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));
const PAYER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 4));
const NOW = 1_700_000_000;

function escrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: '7',
    payer: PAYER,
    payee: RECIPIENT,
    arbiter: ARBITER,
    token: TOKEN,
    amount: '1000000000',
    deadline: String(NOW + 86_400),
    status: 'funded',
    ...overrides,
  };
}

function details(overrides: Partial<Parameters<typeof validateEscrowDetails>[0]> = {}) {
  return {
    recipient: RECIPIENT,
    arbiter: ARBITER,
    amount: '100',
    deadline: toDeadlineValue(NOW + 3600),
    ...overrides,
  };
}

describe('amount parsing and formatting', () => {
  it('parses a human amount into base units', () => {
    expect(amountToBaseUnits('100')).toBe(1_000_000_000n);
    expect(amountToBaseUnits('0.0000001')).toBe(1n);
  });

  it('rejects blank, zero, negative and malformed amounts', () => {
    expect(amountToBaseUnits('')).toBeNull();
    expect(amountToBaseUnits('0')).toBeNull();
    expect(amountToBaseUnits('-5')).toBeNull();
    expect(amountToBaseUnits('abc')).toBeNull();
  });

  it('formats base units without trailing zeros', () => {
    expect(formatEscrowAmount(1_000_000_000n)).toBe('100');
    expect(formatEscrowAmount(1_500_000n)).toBe('0.15');
  });
});

describe('deadline handling', () => {
  it('round-trips a deadline through the datetime-local value', () => {
    // `datetime-local` has minute precision, so compare whole minutes.
    const seconds = parseDeadlineValue(toDeadlineValue(NOW + 3600));
    expect(seconds).not.toBeNull();
    expect(Math.abs(seconds! - (NOW + 3600))).toBeLessThanOrEqual(60);
  });

  it('rejects a value that is not a date', () => {
    expect(parseDeadlineValue('')).toBeNull();
    expect(parseDeadlineValue('not-a-date')).toBeNull();
  });
});

describe('validateEscrowDetails', () => {
  it('accepts a complete first step', () => {
    expect(validateEscrowDetails(details(), NOW)).toEqual({});
  });

  it('requires a recipient and validates the address shape', () => {
    expect(validateEscrowDetails(details({ recipient: '' }), NOW).recipient).toBe(
      'Recipient is required.',
    );
    expect(validateEscrowDetails(details({ recipient: 'nope' }), NOW).recipient).toContain(
      'valid Stellar account',
    );
  });

  it('requires a valid arbiter', () => {
    expect(validateEscrowDetails(details({ arbiter: '' }), NOW).arbiter).toBe(
      'Arbiter is required.',
    );
    expect(validateEscrowDetails(details({ arbiter: 'nope' }), NOW).arbiter).toContain(
      'valid Stellar account',
    );
  });

  it('requires a positive amount', () => {
    expect(validateEscrowDetails(details({ amount: '' }), NOW).amount).toBe('Amount is required.');
    expect(validateEscrowDetails(details({ amount: '0' }), NOW).amount).toContain('positive');
  });

  it('requires a future deadline of at least one minute', () => {
    expect(validateEscrowDetails(details({ deadline: '' }), NOW).deadline).toBe(
      'Deadline is required.',
    );
    expect(
      validateEscrowDetails({ ...details(), deadline: '2020-01-01T00:00' }, NOW).deadline,
    ).toBe('Deadline must be in the future.');
    expect(
      validateEscrowDetails(
        { ...details(), deadline: toDeadlineValue(NOW + 120) },
        // Pin "now" 90s later so the chosen deadline is only 30s away.
        NOW + 90,
      ).deadline,
    ).toBe('Deadline must be at least one minute from now.');
  });
});

describe('validateMilestoneSchedule', () => {
  it('accepts amounts that sum to the escrow total', () => {
    const result = validateMilestoneSchedule(1_000_000_000n, ['40', '60']);

    expect(result.formError).toBeNull();
    expect(result.errors).toEqual([null, null]);
    expect(result.amounts).toEqual([400_000_000n, 600_000_000n]);
  });

  it('rejects a single milestone', () => {
    expect(validateMilestoneSchedule(1_000_000_000n, ['100']).formError).toBe(
      'Add at least 2 milestones.',
    );
  });

  it('reports each invalid row and withholds the parsed amounts', () => {
    const result = validateMilestoneSchedule(1_000_000_000n, ['', '0', '200']);

    expect(result.errors).toEqual(['Amount is required.', 'Enter a positive amount.', null]);
    expect(result.amounts).toBeNull();
  });

  it('rejects a schedule that does not sum to the escrow amount', () => {
    const result = validateMilestoneSchedule(1_000_000_000n, ['40', '50']);

    expect(result.formError).toContain('unallocated');
    expect(result.amounts).toBeNull();
  });

  it('reports an over-allocation', () => {
    expect(validateMilestoneSchedule(1_000_000_000n, ['80', '40']).formError).toContain(
      'over-allocated',
    );
  });

  it('requires a valid total before checking the sum', () => {
    expect(validateMilestoneSchedule(null, ['40', '60']).formError).toBe(
      'Enter a valid escrow amount first.',
    );
  });
});

describe('schedule helpers', () => {
  it('sums only the amounts that parse', () => {
    expect(allocatedMilestoneAmount(['40', '', 'nope'])).toBe(400_000_000n);
  });

  it('splits a total evenly and gives the remainder to the last milestone', () => {
    expect(splitEvenly(10n, 3)).toEqual([3n, 3n, 4n]);
    expect(splitEvenly(9n, 3)).toEqual([3n, 3n, 3n]);
    expect(splitEvenly(9n, 0)).toEqual([]);
  });
});

describe('probeMilestoneSupport', () => {
  it('reports a contract that answers get_milestones as supported', async () => {
    const client = { getMilestones: vi.fn(async () => null) };

    await expect(probeMilestoneSupport(client)).resolves.toBe('supported');
  });

  it('reports a contract error as unsupported', async () => {
    const client = {
      getMilestones: vi.fn(async () => {
        throw new EscrowError('Simulation of get_milestones failed');
      }),
    };

    await expect(probeMilestoneSupport(client)).resolves.toBe('unsupported');
  });

  it('reports a non-contract failure as unknown', async () => {
    const client = {
      getMilestones: vi.fn(async () => {
        throw new Error('network down');
      }),
    };

    await expect(probeMilestoneSupport(client)).resolves.toBe('unknown');
  });
});

describe('release eligibility', () => {
  const schedule = normalizeEscrowSchedule([400n, 600n], [false, false]);

  it('allows the arbiter to release a funded milestone escrow before the deadline', () => {
    expect(getReleaseEligibility(escrow(), schedule, ARBITER, NOW)).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it('requires a connected wallet', () => {
    expect(getReleaseEligibility(escrow(), schedule, null, NOW).reason).toContain('Connect');
  });

  it('rejects the payer, who is not the arbiter', () => {
    expect(getReleaseEligibility(escrow(), schedule, PAYER, NOW).reason).toContain(
      'Only the escrow arbiter',
    );
  });

  it('rejects an unfunded escrow', () => {
    expect(
      getReleaseEligibility(escrow({ status: 'created' }), schedule, ARBITER, NOW).reason,
    ).toBe('The escrow is created.');
  });

  it('rejects an escrow without a schedule', () => {
    expect(getReleaseEligibility(escrow(), null, ARBITER, NOW).reason).toBe(
      'This escrow has no milestone schedule.',
    );
  });

  it('rejects a fully released schedule', () => {
    const released = normalizeEscrowSchedule([400n, 600n], [true, true]);
    expect(getReleaseEligibility(escrow(), released, ARBITER, NOW).reason).toContain(
      'Every milestone',
    );
  });

  it('rejects a release after the deadline', () => {
    expect(getReleaseEligibility(escrow(), schedule, ARBITER, NOW + 86_400 + 1).reason).toContain(
      'deadline has passed',
    );
  });

  it('finds the next unreleased milestone', () => {
    expect(nextReleasableMilestone(schedule)).toBe(0);
    expect(nextReleasableMilestone(normalizeEscrowSchedule([4n, 6n], [true, false]))).toBe(1);
    expect(nextReleasableMilestone(normalizeEscrowSchedule([4n, 6n], [true, true]))).toBeNull();
    expect(nextReleasableMilestone(null)).toBeNull();
  });
});

describe('getLiveEscrowTotals', () => {
  it('tracks the remaining and refundable amounts as milestones release', () => {
    expect(
      getLiveEscrowTotals(
        escrow(),
        normalizeEscrowSchedule([400000000n, 600000000n], [true, false]),
      ),
    ).toEqual({
      remainingAmount: 600_000_000n,
      refundableAmount: 600_000_000n,
      releasedAmount: 400_000_000n,
    });
  });

  it('falls back to the full amount without a schedule', () => {
    expect(getLiveEscrowTotals(escrow({ amount: '250' }), null)).toEqual({
      remainingAmount: 250n,
      refundableAmount: 250n,
      releasedAmount: 0n,
    });
  });
});

describe('describeWizardStep', () => {
  it('labels every step', () => {
    expect(describeWizardStep('details')).toBe('Agreement');
    expect(describeWizardStep('milestones')).toBe('Milestones');
    expect(describeWizardStep('review')).toBe('Review');
  });
});
