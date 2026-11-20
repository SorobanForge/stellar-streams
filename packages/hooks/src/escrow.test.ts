import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EscrowError } from '@stellar-starter-kit/sdk';
import {
  useCancelEscrow,
  useCreateEscrow,
  useFundEscrow,
  useRefundEscrow,
  useReleaseEscrow,
  type CreateEscrowParams,
  type EscrowClientLike,
} from './index';

/** A stub transaction whose `signAndSend` resolves to a confirmed hash. */
function confirmed(hash: string) {
  return { signAndSend: vi.fn().mockResolvedValue({ sendTransactionResponse: { hash } }) };
}

const createParams: CreateEscrowParams = {
  payer: 'GPAYER',
  payee: 'GPAYEE',
  arbiter: 'GARBITER',
  token: 'CTOKEN',
  amount: 1_000n,
  deadline: 2_000n,
};

describe('escrow mutation hooks', () => {
  it('creates an escrow and reports the confirmed hash', async () => {
    const create_escrow = vi.fn().mockResolvedValue(confirmed('tx-create'));
    const client = { create_escrow } as unknown as EscrowClientLike;
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useCreateEscrow(client, { onSuccess }));

    expect(result.current.status).toBe('idle');
    expect(result.current.errorCode).toBeNull();

    let submitted: { hash: string } | null = null;
    await act(async () => {
      submitted = await result.current.mutate(createParams);
    });

    expect(create_escrow).toHaveBeenCalledWith({
      payer: 'GPAYER',
      payee: 'GPAYEE',
      arbiter: 'GARBITER',
      token: 'CTOKEN',
      amount: 1_000n,
      deadline: 2_000n,
    });
    expect(submitted).toEqual({ hash: 'tx-create' });
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-create' });
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-create');
  });

  it('normalises string and number inputs before submitting a create_escrow', async () => {
    const create_escrow = vi.fn().mockResolvedValue(confirmed('tx-create'));
    const client = { create_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useCreateEscrow(client));

    await act(async () => {
      await result.current.mutate({ ...createParams, amount: '2500', deadline: 1_700_000 });
    });

    expect(create_escrow).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2_500n, deadline: 1_700_000n }),
    );
  });

  it('surfaces EscrowError.code when creation is rejected', async () => {
    const create_escrow = vi
      .fn()
      .mockRejectedValue(new EscrowError('Deadline must be in the future', 9));
    const client = { create_escrow } as unknown as EscrowClientLike;
    const onError = vi.fn();

    const { result } = renderHook(() => useCreateEscrow(client, { onError }));

    await act(async () => {
      expect(await result.current.mutate(createParams)).toBeNull();
    });

    expect(onError).toHaveBeenCalledWith('Deadline must be in the future');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Deadline must be in the future');
    expect(result.current.errorCode).toBe('INVALID_DEADLINE');
    expect(result.current.hash).toBeNull();
  });

  it('funds an escrow', async () => {
    const fund_escrow = vi.fn().mockResolvedValue(confirmed('tx-fund'));
    const client = { fund_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useFundEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: '7' })).toEqual({ hash: 'tx-fund' });
    });

    expect(fund_escrow).toHaveBeenCalledWith({ id: 7n });
    expect(result.current.status).toBe('success');
  });

  it('surfaces EscrowError.code when funding a finalized escrow fails', async () => {
    const fund_escrow = vi.fn().mockRejectedValue(new EscrowError('Escrow already finalized', 8));
    const client = { fund_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useFundEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 1n })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('ALREADY_FINALIZED');
  });

  it('releases an escrow', async () => {
    const release_escrow = vi.fn().mockResolvedValue(confirmed('tx-release'));
    const client = { release_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useReleaseEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 1, caller: 'GARBITER' })).toEqual({
        hash: 'tx-release',
      });
    });

    expect(release_escrow).toHaveBeenCalledWith({ id: 1n, caller: 'GARBITER' });
    expect(result.current.hash).toBe('tx-release');
  });

  it('surfaces EscrowError.code when the release caller is not authorized', async () => {
    const release_escrow = vi.fn().mockRejectedValue(new EscrowError('Unauthorized operation', 4));
    const client = { release_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useReleaseEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 1n, caller: 'GSTRANGER' })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('UNAUTHORIZED_OPERATION');
  });

  it('refunds an escrow', async () => {
    const refund_escrow = vi.fn().mockResolvedValue(confirmed('tx-refund'));
    const client = { refund_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useRefundEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 2n, caller: 'GPAYEE' })).toEqual({
        hash: 'tx-refund',
      });
    });

    expect(refund_escrow).toHaveBeenCalledWith({ id: 2n, caller: 'GPAYEE' });
    expect(result.current.status).toBe('success');
  });

  it('surfaces EscrowError.code when a refund is attempted before funding', async () => {
    const refund_escrow = vi.fn().mockRejectedValue(new EscrowError('Invalid state transition', 5));
    const client = { refund_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useRefundEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 3n, caller: 'GPAYEE' })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('INVALID_STATE_TRANSITION');
  });

  it('cancels an escrow', async () => {
    const cancel_escrow = vi.fn().mockResolvedValue(confirmed('tx-cancel'));
    const client = { cancel_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useCancelEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 4n, caller: 'GPAYER' })).toEqual({
        hash: 'tx-cancel',
      });
    });

    expect(cancel_escrow).toHaveBeenCalledWith({ id: 4n, caller: 'GPAYER' });
    expect(result.current.hash).toBe('tx-cancel');
  });

  it('surfaces EscrowError.code when a non-payer tries to cancel', async () => {
    const cancel_escrow = vi.fn().mockRejectedValue(new EscrowError('Unauthorized operation', 4));
    const client = { cancel_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useCancelEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 4n, caller: 'GPAYEE' })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('UNAUTHORIZED_OPERATION');
  });

  it('is a no-op without a connected client', async () => {
    const idle = renderHook(() => useCancelEscrow(null));
    await act(async () => {
      expect(await idle.result.current.mutate({ id: 1n, caller: 'GPAYER' })).toBeNull();
    });
    expect(idle.result.current.status).toBe('idle');
  });

  it('fails when a confirmed response carries no transaction hash', async () => {
    const fund_escrow = vi.fn().mockResolvedValue({ signAndSend: vi.fn().mockResolvedValue({}) });
    const client = { fund_escrow } as unknown as EscrowClientLike;

    const { result } = renderHook(() => useFundEscrow(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 1n })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Transaction confirmed without a hash');
    expect(result.current.errorCode).toBeNull();
  });
});
