import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Split } from '@stellar-starter-kit/types';
import {
  useCreateSplit,
  useDistributeSplit,
  useSplit,
  useSplits,
  type SplitsClientLike,
} from './index';

function makeSplit(overrides: Partial<Split> = {}): Split {
  return {
    id: '1',
    creator: 'GCREATOR',
    recipients: ['GA', 'GB'],
    shares: [60, 40],
    totalShares: 100,
    ...overrides,
  };
}

const params = { creator: 'GCREATOR', recipients: ['GA', 'GB'], shares: [60, 40] };

describe('split read hooks', () => {
  it('loads a split and exposes { data, error, loading, refetch }', async () => {
    const split = makeSplit();
    const getSplit = vi.fn().mockResolvedValue(split);
    const client = { getSplit } as unknown as SplitsClientLike;

    const { result } = renderHook(() => useSplit(client, '1'));

    await waitFor(() => expect(result.current.data).toEqual(split));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getSplit).toHaveBeenCalledWith('1');

    getSplit.mockResolvedValueOnce(makeSplit({ totalShares: 200 }));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data?.totalShares).toBe(200);
    expect(getSplit).toHaveBeenCalledTimes(2);
  });

  it('surfaces a failed read', async () => {
    const getSplit = vi.fn().mockRejectedValue(new Error('split not found'));
    const client = { getSplit } as unknown as SplitsClientLike;

    const { result } = renderHook(() => useSplit(client, 9));
    await waitFor(() => expect(result.current.error).toBe('split not found'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('lists splits and forwards the creator filter', async () => {
    const splits = [makeSplit(), makeSplit({ id: '2' })];
    const listSplits = vi.fn().mockResolvedValue({ splits });
    const client = { listSplits } as unknown as SplitsClientLike;

    const { result } = renderHook(() => useSplits(client, 'GCREATOR'));

    await waitFor(() => expect(result.current.data).toEqual(splits));
    expect(listSplits).toHaveBeenCalledWith(
      expect.objectContaining({ creator: 'GCREATOR', signal: expect.any(AbortSignal) }),
    );
  });

  it('degrades to an empty list when the client cannot list splits', async () => {
    const client = { getSplit: vi.fn() } as unknown as SplitsClientLike;

    const { result } = renderHook(() => useSplits(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe('split mutation hooks', () => {
  it('creates a split, reports pending/success, and refetches the list', async () => {
    const listSplits = vi.fn().mockResolvedValue([]);
    const createSplit = vi.fn().mockResolvedValue({ hash: 'tx-split' });
    const client = { listSplits, createSplit } as unknown as SplitsClientLike;

    const { result } = renderHook(() => ({
      list: useSplits(client),
      create: useCreateSplit(client),
    }));

    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(listSplits).toHaveBeenCalledTimes(1);

    let submitted: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      submitted = result.current.create.mutate(params);
    });
    expect(result.current.create.status).toBe('pending');

    await act(async () => {
      expect(await submitted).toEqual({ hash: 'tx-split' });
    });

    expect(createSplit).toHaveBeenCalledWith(params);
    expect(result.current.create.status).toBe('success');
    expect(result.current.create.hash).toBe('tx-split');

    // The confirmed write asks every split view to re-read.
    await waitFor(() => expect(listSplits).toHaveBeenCalledTimes(2));
  });

  it('distributes a split amount and surfaces a failure', async () => {
    const distribute = vi.fn().mockRejectedValue(new Error('InvalidAmount'));
    const client = { distribute } as unknown as SplitsClientLike;
    const onError = vi.fn();

    const { result } = renderHook(() => useDistributeSplit(client, { onError }));

    let submitted: Promise<{ hash: string } | null> = Promise.resolve(null);
    await act(async () => {
      submitted = result.current.mutate('1', {
        from: 'GFROM',
        token: 'CTOKEN',
        amount: '1000',
      });
      expect(await submitted).toBeNull();
    });

    expect(distribute).toHaveBeenCalledWith('1', {
      from: 'GFROM',
      token: 'CTOKEN',
      amount: '1000',
    });
    expect(onError).toHaveBeenCalledWith('InvalidAmount');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('InvalidAmount');
    expect(result.current.hash).toBeNull();
  });

  it('is a no-op without a client', async () => {
    const { result } = renderHook(() => useCreateSplit(null));

    await act(async () => {
      expect(await result.current.mutate(params)).toBeNull();
    });

    expect(result.current.status).toBe('idle');
  });
});
