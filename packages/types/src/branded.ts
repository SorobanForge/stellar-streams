/**
 * Branded primitive types for Stellar amounts and identifiers.
 *
 * `bigint` and `string` values flow through the SDK in several different
 * roles — stroop amounts, human-readable XLM strings, account addresses, and
 * Soroban contract ids. These branded types make those roles explicit at the
 * type level and provide one validating constructor per role so invalid
 * values are rejected at the boundary instead of leaking into on-chain calls.
 *
 * Branding is additive: the runtime values are still plain `bigint`/`string`,
 * so existing APIs can accept these types wherever the underlying primitive is
 * expected.
 */

import { StrKey } from '@stellar/stellar-sdk';

declare const stroopsBrand: unique symbol;
declare const addressBrand: unique symbol;
declare const contractIdBrand: unique symbol;

/** A non-negative integer amount in stroops (`1 XLM = 10^7` stroops). */
export type Stroops = bigint & { readonly [stroopsBrand]: true };

/** A valid Stellar Ed25519 account address (`G...`). */
export type Address = string & { readonly [addressBrand]: true };

/** A valid Soroban contract id (`C...`). */
export type ContractId = string & { readonly [contractIdBrand]: true };

const DECIMAL_INTEGER = /^\d+$/;

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  return String(value);
}

/**
 * Validate and brand a stroop amount.
 *
 * Accepts a non-negative `bigint`, a non-negative safe-integer `number`, or a
 * decimal integer string. Fractional, negative, unsafe, and non-numeric
 * values throw a `TypeError` rather than being silently coerced.
 *
 * @example
 * const amount = asStroops('10000000'); // 1 XLM in stroops
 */
export function asStroops(value: unknown): Stroops {
  let amount: bigint;

  if (typeof value === 'bigint') {
    amount = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Stroops must be a safe integer; received ${describe(value)}.`);
    }
    amount = BigInt(value);
  } else if (typeof value === 'string') {
    if (!DECIMAL_INTEGER.test(value)) {
      throw new TypeError(
        `Stroops string must contain only decimal digits; received ${describe(value)}.`,
      );
    }
    amount = BigInt(value);
  } else {
    throw new TypeError(
      `Stroops must be a bigint, safe integer, or decimal string; received ${describe(value)}.`,
    );
  }

  if (amount < 0n) {
    throw new TypeError(`Stroops must not be negative; received ${describe(value)}.`);
  }

  return amount as Stroops;
}

/**
 * Validate and brand a Stellar Ed25519 account address.
 *
 * Uses `StrKey` so the checksum is validated, not just the `G...` shape.
 *
 * @example
 * const account = asAddress('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN');
 */
export function asAddress(value: unknown): Address {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !StrKey.isValidEd25519PublicKey(value)
  ) {
    throw new TypeError(
      `Address must be a valid Stellar Ed25519 public key (G...); received ${describe(value)}.`,
    );
  }
  return value as Address;
}

/**
 * Validate and brand a Soroban contract id.
 *
 * Uses `StrKey` so the checksum is validated, not just the `C...` shape.
 *
 * @example
 * const token = asContractId('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
 */
export function asContractId(value: unknown): ContractId {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !StrKey.isValidContract(value)
  ) {
    throw new TypeError(
      `ContractId must be a valid Soroban contract id (C...); received ${describe(value)}.`,
    );
  }
  return value as ContractId;
}

/** Type guard for branded stroop amounts; never throws. */
export function isStroops(value: unknown): value is Stroops {
  try {
    asStroops(value);
    return true;
  } catch {
    return false;
  }
}

/** Type guard for branded Stellar account addresses; never throws. */
export function isAddress(value: unknown): value is Address {
  try {
    asAddress(value);
    return true;
  } catch {
    return false;
  }
}

/** Type guard for branded Soroban contract ids; never throws. */
export function isContractId(value: unknown): value is ContractId {
  try {
    asContractId(value);
    return true;
  } catch {
    return false;
  }
}
