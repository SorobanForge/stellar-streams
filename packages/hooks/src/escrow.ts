import { useCallback } from 'react';
import { useContractMutation, type MutationOptions, type MutationResult } from './mutation.js';

/**
 * Hooks for the escrow contract's write methods.
 *
 * The SDK exports `EscrowError` but does not ship an escrow client yet, so these
 * hooks are typed against the structural `EscrowClientLike` below. The
 * generated client from `@stellar-starter-kit/contracts`
 * (`EscrowClient.Client`) satisfies it unchanged, which lets a page swap its
 * hand-rolled `signAndSend` blocks for the shared mutation state without a
 * wrapper.
 *
 * Every hook returns the same `{ mutate, status, error, errorCode, hash, reset }`
 * shape as the stream hooks: one write in flight per hook instance, a mounted
 * guard, and `errorCode` carrying `EscrowError.code` so a UI can branch on the
 * contract outcome instead of matching message text.
 */

/** Any escrow id accepted by the contract's write methods. */
export type EscrowId = bigint | number | string;

/** Inputs for `create_escrow`. `amount` is in the token's smallest unit. */
export interface CreateEscrowParams {
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  /** Amount to escrow, in the token's smallest unit. */
  amount: bigint | number | string;
  /** Unix timestamp (seconds) after which the escrow can be refunded. */
  deadline: bigint | number | string;
}

/** Identifies an existing escrow. */
export interface EscrowIdParams {
  id: EscrowId;
}

/** Identifies an existing escrow together with the signing caller. */
export interface EscrowCallerParams extends EscrowIdParams {
  caller: string;
}

/**
 * The transaction object a generated escrow write returns. Only `signAndSend`
 * is used, and its result is read structurally so the hooks stay independent of
 * the generated client's exact `AssembledTransaction` type.
 */
export interface EscrowWriteTransaction {
  signAndSend(): Promise<unknown>;
}

/**
 * The escrow write methods the hooks use. Matches the generated
 * `EscrowClient.Client`; ids and amounts are `bigint` on the wire, which is why
 * the hooks normalise their looser inputs before calling in.
 */
export interface EscrowClientLike {
  create_escrow(params: {
    payer: string;
    payee: string;
    arbiter: string;
    token: string;
    amount: bigint;
    deadline: bigint;
  }): Promise<EscrowWriteTransaction>;
  fund_escrow(params: { id: bigint }): Promise<EscrowWriteTransaction>;
  release_escrow(params: { id: bigint; caller: string }): Promise<EscrowWriteTransaction>;
  refund_escrow(params: { id: bigint; caller: string }): Promise<EscrowWriteTransaction>;
  cancel_escrow(params: { id: bigint; caller: string }): Promise<EscrowWriteTransaction>;
}

export type EscrowMutationOptions = MutationOptions;
export type EscrowMutationResult<TArgs extends unknown[]> = MutationResult<TArgs>;

/** Converts a caller-supplied id/amount to the `bigint` the contract expects. */
function toBigInt(value: bigint | number | string, field: string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`Invalid ${field}: ${String(value)}`);
  }
}

/**
 * Extracts the confirmed transaction hash from an `AssembledTransaction`'s
 * `signAndSend` result. The SDK reports it under `sendTransactionResponse`;
 * a response without one never reached the chain, so it is treated as a
 * failure rather than reported as a confirmed write.
 */
function confirmedHash(sent: unknown): string {
  if (typeof sent === 'object' && sent !== null) {
    const response = (sent as { sendTransactionResponse?: unknown }).sendTransactionResponse;
    if (typeof response === 'object' && response !== null) {
      const hash = (response as { hash?: unknown }).hash;
      if (typeof hash === 'string' && hash.length > 0) return hash;
    }
  }
  throw new Error('Transaction confirmed without a hash');
}

/** Builds and submits one escrow write. */
type EscrowWrite<TArgs extends unknown[]> = (
  client: EscrowClientLike,
  ...args: TArgs
) => Promise<EscrowWriteTransaction>;

/**
 * The one body shared by every escrow write hook: build the transaction through
 * the client, submit it, and reduce the confirmed response to `{ hash }` for
 * the mutation state machine. The five exported hooks only map their arguments,
 * so pending/success/error/abort handling lives in exactly one place.
 */
function useEscrowWrite<TArgs extends unknown[]>(
  client: EscrowClientLike | null,
  write: EscrowWrite<TArgs>,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<TArgs> {
  const run = useCallback(
    async (escrow: EscrowClientLike, ...args: TArgs) => {
      const transaction = await write(escrow, ...args);
      return { hash: confirmedHash(await transaction.signAndSend()) };
    },
    [write],
  );
  return useContractMutation<EscrowClientLike, TArgs>(client, run, options);
}

const createEscrowWrite: EscrowWrite<[CreateEscrowParams]> = (escrow, params) =>
  escrow.create_escrow({
    payer: params.payer,
    payee: params.payee,
    arbiter: params.arbiter,
    token: params.token,
    amount: toBigInt(params.amount, 'amount'),
    deadline: toBigInt(params.deadline, 'deadline'),
  });

const fundEscrowWrite: EscrowWrite<[EscrowIdParams]> = (escrow, params) =>
  escrow.fund_escrow({ id: toBigInt(params.id, 'escrow id') });

const releaseEscrowWrite: EscrowWrite<[EscrowCallerParams]> = (escrow, params) =>
  escrow.release_escrow({ id: toBigInt(params.id, 'escrow id'), caller: params.caller });

const refundEscrowWrite: EscrowWrite<[EscrowCallerParams]> = (escrow, params) =>
  escrow.refund_escrow({ id: toBigInt(params.id, 'escrow id'), caller: params.caller });

const cancelEscrowWrite: EscrowWrite<[EscrowCallerParams]> = (escrow, params) =>
  escrow.cancel_escrow({ id: toBigInt(params.id, 'escrow id'), caller: params.caller });

/**
 * Creates an escrow, returning the confirmed transaction hash. The contract
 * assigns the id; read it back with `get_escrow`/`next_escrow_id` if needed.
 */
export function useCreateEscrow(
  client: EscrowClientLike | null,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<[CreateEscrowParams]> {
  return useEscrowWrite<[CreateEscrowParams]>(client, createEscrowWrite, options);
}

/** Funds an existing escrow from its payer's balance. */
export function useFundEscrow(
  client: EscrowClientLike | null,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<[EscrowIdParams]> {
  return useEscrowWrite<[EscrowIdParams]>(client, fundEscrowWrite, options);
}

/** Releases a funded escrow to the payee (payer or arbiter). */
export function useReleaseEscrow(
  client: EscrowClientLike | null,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<[EscrowCallerParams]> {
  return useEscrowWrite<[EscrowCallerParams]>(client, releaseEscrowWrite, options);
}

/** Refunds a funded escrow to the payer (payee or arbiter). */
export function useRefundEscrow(
  client: EscrowClientLike | null,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<[EscrowCallerParams]> {
  return useEscrowWrite<[EscrowCallerParams]>(client, refundEscrowWrite, options);
}

/** Cancels an escrow; only the payer may cancel, before funding or post-deadline. */
export function useCancelEscrow(
  client: EscrowClientLike | null,
  options: EscrowMutationOptions = {},
): EscrowMutationResult<[EscrowCallerParams]> {
  return useEscrowWrite<[EscrowCallerParams]>(client, cancelEscrowWrite, options);
}
