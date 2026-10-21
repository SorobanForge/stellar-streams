import { StrKey } from 'stellar-sdk';

export type StreamFormValues = {
  recipient: string;
  token?: string;
  amount: string;
  durationDays: string;
  cliffDays: string;
};

export type StreamFormErrors = Partial<Record<keyof StreamFormValues, string>>;

const DAY_SECONDS = 86_400;

export function parsePositiveNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function validateStreamInput(values: StreamFormValues): StreamFormErrors {
  const errors: StreamFormErrors = {};
  const recipient = values.recipient.trim();

  if (!recipient) {
    errors.recipient = 'Recipient is required.';
  } else if (!StrKey.isValidEd25519PublicKey(recipient) && !StrKey.isValidContract(recipient)) {
    errors.recipient =
      'Recipient must be a valid Stellar account (G...) or contract (C...) address.';
  }

  const token = values.token?.trim() ?? '';
  if (!token) {
    errors.token = 'Token contract is required.';
  } else if (!StrKey.isValidContract(token)) {
    errors.token = 'Token must be a valid contract address (C...).';
  }

  const amount = parsePositiveNumber(values.amount);
  if (values.amount.trim() === '') {
    errors.amount = 'Amount is required.';
  } else if (amount === null) {
    errors.amount = 'Amount must be a positive number.';
  }

  const durationDays = parsePositiveNumber(values.durationDays);
  if (values.durationDays.trim() === '') {
    errors.durationDays = 'Duration is required.';
  } else if (durationDays === null || durationDays < 1) {
    errors.durationDays = 'Duration must be at least 1 day.';
  }

  const cliffDays = values.cliffDays.trim() === '' ? 0 : Number(values.cliffDays);
  if (values.cliffDays.trim() !== '' && (!Number.isFinite(cliffDays) || cliffDays < 0)) {
    errors.cliffDays = 'Cliff must be 0 or a positive number of days.';
  }

  if (durationDays !== null && Number.isFinite(cliffDays) && cliffDays > durationDays) {
    errors.cliffDays = 'Cliff cannot exceed the stream duration.';
  }

  if (durationDays !== null && Number.isFinite(cliffDays) && cliffDays > durationDays * 365) {
    errors.durationDays = 'Duration is too short for the chosen cliff.';
  }

  return errors;
}

export function getStreamDurationSeconds(durationDays: string): number {
  return Math.floor(Number(durationDays) * DAY_SECONDS);
}

export function getStreamCliffSeconds(cliffDays: string): number {
  return Math.floor(Number(cliffDays || '0') * DAY_SECONDS);
}

export function isStreamFormValid(values: StreamFormValues): boolean {
  return Object.keys(validateStreamInput(values)).length === 0;
}
