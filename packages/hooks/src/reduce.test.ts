import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useReduceStream, useStream, type ReduceStreamsClientLike } from './index';

function makeStream(overrides: Partial<Stream> = {}): Stream {
  return {
    id: '1',
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKEN',
    totalAmount: '1000',
    withdrawn: '0',
    startTime: 0,
    endTime: 1_000,
    cliffTime: 0,
    cancelled: false,
    label: '',
    reference: '',
    ...overrides,
  };
}

/**
 * A fake client backed by a mutable stream value, so the refetch a hook
 * triggers after a confirmed reduction observes the new total.
 */
function makeClient(initial: Stream) {
  let current = initial;
  const getStream = vi.fn(async () => current);
  const claimable = vi.fn(async () => 0n);
  const reduceStream = vi.fn(async (_id: bigint | number | string, newTotal: bigint) => {
    current = { ...current, totalAmount: newTotal.toString() };
    return { hash: 'tx-reduce' };
  });
  return {
    getStream,
    reduceStream,
    setCurrent(next: Stream) {
      current = next;
    },
    client: { getStream, claimable, reduceStream } as unknown as ReduceStreamsClientLike,
  };
}

describe('useReduceStream', () => {
  it('reduces the total and refreshes every mounted useStream reader', async () => {
    const { client, getStream, reduceStream } = makeClient(makeStream());
    const onSuccess = vi.fn();

    const { result } = renderHook(() => ({
      view: useStream(client as unknown as StreamsClient, 1),
      reduce: useReduceStream(client, { onSuccess }),
    }));

    await waitFor(() => expect(result.current.view.stream?.totalAmount).toBe('1000'));
    expect(getStream).toHaveBeenCalledTimes(1);

    let submitted: { hash: string } | null = null;
    await act(async () => {
      submitted = await result.current.reduce.mutate({ id: 1, newTotal: 400n });
    });

    expect(reduceStream).toHaveBeenCalledWith(1, 400n);
    expect(submitted).toEqual({ hash: 'tx-reduce' });
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-reduce' });
    expect(result.current.reduce.status).toBe('success');
    expect(result.current.reduce.hash).toBe('tx-reduce');

    // The confirmed write asks the stream view to re-read without waiting for
    // a poll: one mount read plus the refresh.
    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(2));
    expect(result.current.view.stream?.totalAmount).toBe('400');
  });

  it('shows the reduced total optimistically and rolls it back on failure', async () => {
    const { client } = makeClient(makeStream());
    let reject: (reason?: unknown) => void = () => {};
    const gate = new Promise<{ hash: string }>((_, rej) => {
      reject = rej;
    });
    const reduceStream = vi.fn(() => gate);
    Object.assign(client, { reduceStream });

    const { result } = renderHook(() => ({
      view: useStream(client as unknown as StreamsClient, 1),
      reduce: useReduceStream(client),
    }));

    await waitFor(() => expect(result.current.view.stream?.totalAmount).toBe('1000'));

    let inFlight: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      inFlight = result.current.reduce.mutate({ id: 1, newTotal: 250n });
    });

    await waitFor(() => expect(result.current.view.stream?.totalAmount).toBe('250'));
    expect(result.current.reduce.status).toBe('pending');

    await act(async () => {
      reject(new Error('reduction rejected'));
      await inFlight;
    });

    expect(result.current.reduce.status).toBe('error');
    // The rolled-back overlay restores the last read value.
    expect(result.current.view.stream?.totalAmount).toBe('1000');
  });

  it('rejects a negative total without submitting a transaction', async () => {
    const reduceStream = vi.fn();
    const client = { reduceStream } as unknown as ReduceStreamsClientLike;
    const onError = vi.fn();

    const { result } = renderHook(() => useReduceStream(client, { onError }));

    await act(async () => {
      expect(await result.current.mutate({ id: 1, newTotal: -1n })).toBeNull();
    });

    expect(reduceStream).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/negative/i);
    expect(onError).toHaveBeenCalledWith('Stream total cannot be negative');
  });

  it('surfaces a REDUCTION_BELOW_VESTED rejection from the contract', async () => {
    const rejection = Object.assign(new Error('reduction below vested'), {
      code: 'REDUCTION_BELOW_VESTED',
    });
    const reduceStream = vi.fn().mockRejectedValue(rejection);
    const client = { reduceStream } as unknown as ReduceStreamsClientLike;

    const { result } = renderHook(() => useReduceStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 5, newTotal: 10n })).toBeNull();
    });

    expect(reduceStream).toHaveBeenCalledWith(5, 10n);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('reduction below vested');
    expect(result.current.errorCode).toBe('REDUCTION_BELOW_VESTED');
    expect(result.current.hash).toBeNull();
  });

  it('is a no-op without a client', async () => {
    const { result } = renderHook(() => useReduceStream(null));

    await act(async () => {
      expect(await result.current.mutate({ id: 1, newTotal: 10n })).toBeNull();
    });

    expect(result.current.status).toBe('idle');
  });
});
