import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowClient, EscrowMilestones } from '@stellar-starter-kit/sdk';
import type { Escrow, EscrowStatus } from '@stellar-starter-kit/types';
import { isEscrowFinal, useEscrow } from './index';
import { clearRequestCache } from './request-cache';

function makeEscrow(id: string, status: EscrowStatus = 'funded'): Escrow {
  return {
    id,
    payer: 'GPAYER',
    payee: 'GPAYEE',
    arbiter: 'GARBITER',
    token: 'CTOKEN',
    amount: '1000',
    deadline: '2000',
    status,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A fake client exposing only the two reads `useEscrow` performs. */
function makeClient(
  escrow: Escrow | null = makeEscrow('1'),
  milestones: EscrowMilestones | null = null,
) {
  const getEscrow = vi.fn(async (_id: bigint | number | string) => escrow);
  const getMilestones = vi.fn(async (_id: bigint | number | string) => milestones);
  return {
    getEscrow,
    getMilestones,
    client: { getEscrow, getMilestones } as unknown as EscrowClient,
  };
}

beforeEach(() => {
  clearRequestCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isEscrowFinal', () => {
  it.each<[EscrowStatus, boolean]>([
    ['created', false],
    ['funded', false],
    ['released', true],
    ['refunded', true],
    ['cancelled', true],
  ])('treats %s as final=%s', (status, final) => {
    expect(isEscrowFinal(makeEscrow('1', status))).toBe(final);
  });

  it('is false without an escrow', () => {
    expect(isEscrowFinal(null)).toBe(false);
  });
});

describe('useEscrow', () => {
  it('loads the escrow with its milestones and released flags', async () => {
    const escrow = makeEscrow('7');
    const { client, getEscrow, getMilestones } = makeClient(escrow, {
      amounts: ['250', '750'],
      released: [true, false],
    });

    const { result } = renderHook(() => useEscrow(client, 7n));

    await waitFor(() => expect(result.current.escrow).toEqual(escrow));
    expect(result.current.milestones).toEqual(['250', '750']);
    expect(result.current.released).toEqual([true, false]);
    expect(result.current.isFinal).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
    expect(getEscrow).toHaveBeenCalledWith(7n);
    expect(getMilestones).toHaveBeenCalledWith(7n);
  });

  it('exposes empty milestone lists for an escrow without a schedule', async () => {
    const { client } = makeClient(makeEscrow('1'), null);

    const { result } = renderHook(() => useEscrow(client, 1));

    await waitFor(() => expect(result.current.escrow).not.toBeNull());
    expect(result.current.milestones).toEqual([]);
    expect(result.current.released).toEqual([]);
  });

  it('stays empty and idle without a client or id', async () => {
    const { client, getEscrow } = makeClient();

    const { result } = renderHook(() => useEscrow(client, null));

    expect(result.current.escrow).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(getEscrow).not.toHaveBeenCalled();
  });

  it('retries a failing read with backoff before surfacing it', async () => {
    const escrow = makeEscrow('1');
    const { client, getEscrow } = makeClient(escrow);
    getEscrow
      .mockRejectedValueOnce(new Error('rpc hiccup'))
      .mockRejectedValueOnce(new Error('rpc hiccup'));

    const { result } = renderHook(() =>
      useEscrow(client, 1, { retries: 2, retryDelayMs: 1, maxRetryDelayMs: 4 }),
    );

    await waitFor(() => expect(result.current.escrow).toEqual(escrow));
    expect(getEscrow).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it('keeps the last good value and marks it stale once retries are exhausted', async () => {
    const escrow = makeEscrow('1');
    const { client, getMilestones } = makeClient(escrow);

    const { result } = renderHook(() => useEscrow(client, 1, { retries: 1, retryDelayMs: 1 }));
    await waitFor(() => expect(result.current.escrow).toEqual(escrow));

    // A milestone read failure fails the load just like an escrow read failure.
    getMilestones.mockRejectedValue(new Error('rpc down'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('rpc down');
    expect(result.current.isStale).toBe(true);
    expect(result.current.escrow).toEqual(escrow);
    expect(result.current.loading).toBe(false);
  });

  it('accepts a bare poll interval like useStream', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient(makeEscrow('1', 'funded'));

    renderHook(() => useEscrow(client, 1, 1_000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getEscrow).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(4);
  });

  it('stops polling once the escrow becomes final', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient(makeEscrow('1', 'funded'));

    const { result } = renderHook(() => useEscrow(client, 1, { pollMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isFinal).toBe(false);

    // Two polls while the escrow is still open.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(3);

    // The next poll observes the release.
    getEscrow.mockResolvedValue(makeEscrow('1', 'released'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(4);
    expect(result.current.escrow?.status).toBe('released');
    expect(result.current.isFinal).toBe(true);

    // No further polls once final.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(4);

    // A manual refresh still works after polling stopped.
    await act(async () => {
      await result.current.refresh();
    });
    expect(getEscrow).toHaveBeenCalledTimes(5);
  });

  it('never starts polling an escrow that is already final', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient(makeEscrow('1', 'cancelled'));

    const { result } = renderHook(() => useEscrow(client, 1, { pollMs: 500 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isFinal).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while the escrow does not exist yet', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient(null);

    renderHook(() => useEscrow(client, 1, { pollMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(3);
  });

  it('stops polling and ignores in-flight reads after unmount', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient(makeEscrow('1'));

    const { unmount } = renderHook(() => useEscrow(client, 1, { pollMs: 1_000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getEscrow).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a pending retry backoff on unmount', async () => {
    vi.useFakeTimers();
    const { client, getEscrow } = makeClient();
    getEscrow.mockRejectedValue(new Error('rpc down'));

    const { unmount } = renderHook(() =>
      useEscrow(client, 1, { retries: 5, retryDelayMs: 10_000 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getEscrow).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    // The backoff ended with the unmount: no retry fired, no timer remains.
    expect(getEscrow).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards a slow response for a previous id', async () => {
    const slow = deferred<Escrow | null>();
    const { client, getEscrow } = makeClient();
    getEscrow.mockImplementation(async (id) =>
      String(id) === '1' ? slow.promise : makeEscrow(String(id)),
    );

    const { result, rerender } = renderHook(({ id }) => useEscrow(client, id), {
      initialProps: { id: 1 },
    });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.escrow?.id).toBe('2'));

    // The first read settles late; it must not replace escrow 2.
    await act(async () => {
      slow.resolve(makeEscrow('1'));
      await slow.promise;
    });
    expect(result.current.escrow?.id).toBe('2');
    expect(result.current.loading).toBe(false);
  });

  it('shares one read between concurrent hooks, while refresh() bypasses it', async () => {
    const gate = deferred<Escrow | null>();
    const { client, getEscrow, getMilestones } = makeClient();
    getEscrow.mockImplementationOnce(() => gate.promise);

    const first = renderHook(() => useEscrow(client, 1));
    const second = renderHook(() => useEscrow(client, 1));
    expect(getEscrow).toHaveBeenCalledTimes(1);
    expect(getMilestones).toHaveBeenCalledTimes(1);

    gate.resolve(makeEscrow('1'));
    await waitFor(() => expect(first.result.current.escrow?.id).toBe('1'));
    await waitFor(() => expect(second.result.current.escrow?.id).toBe('1'));

    await act(async () => {
      await first.result.current.refresh();
    });
    expect(getEscrow).toHaveBeenCalledTimes(2);
  });
});
