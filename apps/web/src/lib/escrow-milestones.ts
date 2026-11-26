import { StrKey } from 'stellar-sdk';
import { EscrowError, type EscrowClient } from '@stellar-starter-kit/sdk';
import {
  getEscrowTotals,
  type Escrow,
  type EscrowSchedule,
  type EscrowTotals,
} from '@stellar-starter-kit/types';
import { formatTokenAmount, parseTokenAmount } from '@stellar-starter-kit/utils';

/**
 * Decimals assumed for escrow amounts. The escrow page settles in the native
 * XLM SAC (7 decimals) unless a custom token is configured, and the wizard
 * reports amounts in the token's smallest unit through the same assumption the
 * existing create form uses.
 */
export const ESCROW_TOKEN_DECIMALS = 7;

/** The contract rejects a schedule with fewer than two tranches. */
export const MIN_MILESTONES = 2;
/** A schedule longer than this is unwieldy in the wizard; the contract has no cap. */
export const MAX_MILESTONES = 12;

/** A deadline this close to now is rejected by the contract on submission. */
export const MIN_DEADLINE_LEAD_SECONDS = 60;

export const WIZARD_STEPS = ['details', 'milestones', 'review'] as const;
export type EscrowWizardStep = (typeof WIZARD_STEPS)[number];

export interface EscrowDetailsValues {
  /** Payee address: a Stellar account (G...) or contract (C...). */
  recipient: string;
  /** Arbiter address, authorized to release milestones. */
  arbiter: string;
  /** Total escrow amount as a human-readable decimal string. */
  amount: string;
  /** Deadline as a `datetime-local` value (local time, no timezone suffix). */
  deadline: string;
}

export type EscrowDetailsErrors = Partial<Record<keyof EscrowDetailsValues, string>>;

export interface MilestoneValidation {
  /** Per-row error messages; `null` for a valid row. Empty when all are valid. */
  errors: Array<string | null>;
  /** Parsed amounts in the token's smallest unit, or `null` when any row is invalid. */
  amounts: bigint[] | null;
  /** Error that applies to the schedule as a whole (too few rows, wrong sum). */
  formError: string | null;
}

/** Format a base-unit amount for display, trimming trailing fractional zeros. */
export function formatEscrowAmount(baseUnits: bigint, decimals = ESCROW_TOKEN_DECIMALS): string {
  return formatTokenAmount(baseUnits, decimals);
}

/**
 * Parse a human-readable amount into the token's smallest unit.
 * Returns `null` for blank or non-positive input instead of throwing, so form
 * validation can render a message.
 */
export function amountToBaseUnits(value: string, decimals = ESCROW_TOKEN_DECIMALS): bigint | null {
  if (value.trim() === '') return null;
  try {
    const baseUnits = parseTokenAmount(value, decimals);
    return baseUnits > 0n ? baseUnits : null;
  } catch {
    return null;
  }
}

/** Parse a `datetime-local` value into unix seconds; `null` when it is not a date. */
export function parseDeadlineValue(value: string): number | null {
  if (!value.trim()) return null;
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) return null;
  return Math.floor(millis / 1000);
}

/** Render unix seconds as the `datetime-local` value a form input expects. */
export function toDeadlineValue(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const isAddress = (value: string) =>
  StrKey.isValidEd25519PublicKey(value) || StrKey.isValidContract(value);

/** Validate the first wizard step: recipient, arbiter, amount and deadline. */
export function validateEscrowDetails(
  values: EscrowDetailsValues,
  nowSeconds: number,
): EscrowDetailsErrors {
  const errors: EscrowDetailsErrors = {};

  const recipient = values.recipient.trim();
  if (!recipient) {
    errors.recipient = 'Recipient is required.';
  } else if (!isAddress(recipient)) {
    errors.recipient =
      'Recipient must be a valid Stellar account (G...) or contract (C...) address.';
  }

  const arbiter = values.arbiter.trim();
  if (!arbiter) {
    errors.arbiter = 'Arbiter is required.';
  } else if (!isAddress(arbiter)) {
    errors.arbiter = 'Arbiter must be a valid Stellar account (G...) or contract (C...) address.';
  }

  if (values.amount.trim() === '') {
    errors.amount = 'Amount is required.';
  } else if (amountToBaseUnits(values.amount) === null) {
    errors.amount = 'Amount must be a positive number.';
  }

  const deadline = parseDeadlineValue(values.deadline);
  if (deadline === null) {
    errors.deadline = 'Deadline is required.';
  } else if (deadline <= nowSeconds) {
    errors.deadline = 'Deadline must be in the future.';
  } else if (deadline < nowSeconds + MIN_DEADLINE_LEAD_SECONDS) {
    errors.deadline = 'Deadline must be at least one minute from now.';
  }

  return errors;
}

/**
 * Validate and parse the milestone schedule.
 *
 * The contract requires at least two strictly positive amounts that sum to the
 * escrow total, so the wizard mirrors those rules and reports one error per
 * row plus a schedule-level error for a wrong sum or too few rows.
 */
export function validateMilestoneSchedule(
  totalBaseUnits: bigint | null,
  values: readonly string[],
): MilestoneValidation {
  const errors: Array<string | null> = values.map((value) => {
    if (value.trim() === '') return 'Amount is required.';
    return amountToBaseUnits(value) === null ? 'Enter a positive amount.' : null;
  });

  const parsed = values.map((value) => amountToBaseUnits(value));
  const allParsed = parsed.every((amount): amount is bigint => amount !== null);
  let formError: string | null = null;

  if (values.length < MIN_MILESTONES) {
    formError = `Add at least ${MIN_MILESTONES} milestones.`;
  } else if (totalBaseUnits === null) {
    formError = 'Enter a valid escrow amount first.';
  } else if (allParsed) {
    const sum = parsed.reduce((total, amount) => total + amount, 0n);
    if (sum !== totalBaseUnits) {
      const diff = totalBaseUnits - sum;
      const direction = diff > 0n ? 'unallocated' : 'over-allocated';
      formError = `Milestones must add up to the escrow amount (${formatEscrowAmount(diff < 0n ? -diff : diff)} ${direction}).`;
    }
  }

  return {
    errors,
    amounts: allParsed && formError === null ? parsed : null,
    formError,
  };
}

/** Total of the milestone rows entered so far, ignoring blank or invalid rows. */
export function allocatedMilestoneAmount(
  values: readonly string[],
  decimals = ESCROW_TOKEN_DECIMALS,
): bigint {
  return values.reduce((total, value) => {
    const amount = amountToBaseUnits(value, decimals);
    return amount === null ? total : total + amount;
  }, 0n);
}

/** Split a total into `count` equal amounts, assigning the remainder to the last. */
export function splitEvenly(totalBaseUnits: bigint, count: number): bigint[] {
  if (count <= 0) return [];
  const base = totalBaseUnits / BigInt(count);
  const remainder = totalBaseUnits - base * BigInt(count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? base + remainder : base,
  );
}

export type MilestoneSupport = 'supported' | 'unsupported' | 'unknown';

/**
 * Runtime gate for the milestone contract change.
 *
 * `get_milestones` is part of the milestone-release contract update, so asking
 * it for a missing schedule is a cheap capability probe: a deployed milestone
 * contract answers `null`, while an older contract fails the simulation. A
 * failure that is not an `EscrowError` (RPC unreachable, for example) is
 * reported as `unknown` instead of disabling the wizard permanently.
 */
export async function probeMilestoneSupport(
  client: Pick<EscrowClient, 'getMilestones'>,
): Promise<MilestoneSupport> {
  try {
    await client.getMilestones(0);
    return 'supported';
  } catch (error) {
    return error instanceof EscrowError ? 'unsupported' : 'unknown';
  }
}

export interface ReleaseEligibility {
  /** Whether the connected wallet can release a milestone right now. */
  allowed: boolean;
  /** Why not, when `allowed` is false. */
  reason: string | null;
}

/**
 * Whether `caller` may release a milestone of `escrow`.
 *
 * The contract allows the payer or the arbiter, while the dashboard's release
 * flow is aimed at the arbiter; the payer is rejected here so a payer wallet
 * cannot bypass the arbiter's decision from this panel. The remaining checks
 * mirror the contract's own guards so the UI explains the block instead of
 * letting a transaction fail.
 */
export function getReleaseEligibility(
  escrow: Escrow,
  schedule: EscrowSchedule | null,
  caller: string | null,
  nowSeconds: number,
): ReleaseEligibility {
  if (!caller) {
    return { allowed: false, reason: 'Connect the arbiter wallet to release milestones.' };
  }
  if (caller !== escrow.arbiter) {
    return { allowed: false, reason: 'Only the escrow arbiter can release milestones here.' };
  }
  if (escrow.status !== 'funded') {
    return { allowed: false, reason: `The escrow is ${escrow.status}.` };
  }
  if (!schedule || schedule.milestones.length === 0) {
    return { allowed: false, reason: 'This escrow has no milestone schedule.' };
  }
  if (schedule.milestones.every((milestone) => milestone.released)) {
    return { allowed: false, reason: 'Every milestone has already been released.' };
  }
  if (nowSeconds > Number(escrow.deadline)) {
    return { allowed: false, reason: 'The deadline has passed; the remainder is refundable.' };
  }
  return { allowed: true, reason: null };
}

/** The first milestone that has not been released, or `null` when all are. */
export function nextReleasableMilestone(schedule: EscrowSchedule | null): number | null {
  if (!schedule) return null;
  const milestone = schedule.milestones.find((entry) => !entry.released);
  return milestone ? milestone.index : null;
}

/**
 * Live remaining and refundable amounts for an escrow.
 *
 * Mirrors the contract's `remaining_amount` and `refundable_amount` so the
 * dashboard updates both numbers as soon as a release confirms.
 */
export function getLiveEscrowTotals(
  escrow: Pick<Escrow, 'amount'>,
  schedule: EscrowSchedule | null,
): EscrowTotals {
  return getEscrowTotals(escrow, schedule);
}

/** Human label for the wizard step, used in the progress indicator. */
export function describeWizardStep(step: EscrowWizardStep): string {
  switch (step) {
    case 'details':
      return 'Agreement';
    case 'milestones':
      return 'Milestones';
    case 'review':
      return 'Review';
  }
}
