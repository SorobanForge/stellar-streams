import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useStream, type StreamId } from './index';

/** The read `useStream` performs, as the stub implements it. */
type GetStream = (id: StreamId) => Promise<Stream | null>;

/** A promise plus its resolver, so a test can hold a fetch open and inspect state. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeStream(id: string, totalAmount = '100'): Stream {
  return {
    id,
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKEN',
    totalAmount,
    withdrawn: '0',
    startTime: 0,
    endTime: 1_000,
    cliffTime: 0,
    cancelled: false,
    label: '',
    reference: '',
  };
}

/** Only the two reads `useStream` performs are stubbed. */
function makeClient(getStream: GetStream): StreamsClient {
  return { getStream, claimable: vi.fn().mockResolvedValue(0n) } as unknown as StreamsClient;
}

describe('useStream', () => {
  it('loads the stream and its claimable balance on mount', async () => {
    const stream = makeStream('1');
    const getStream = vi.fn().mockResolvedValue(stream);
    const client = makeClient(getStream);

    const { result } = renderHook(() => useStream(client, 1, { retryDelayMs: 1 }));

    await waitFor(() => expect(result.current.stream).toEqual(stream));

    expect(result.current.claimable).toBe(0n);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
    expect(getStream).toHaveBeenCalledTimes(1);
  });

  it('retries a fetch that fails twice and then succeeds, without surfacing an error', async () => {
    const first = makeStream('1');
    const recovered = makeStream('1', '250');
    const getStream = vi.fn().mockResolvedValueOnce(first);
    const client = makeClient(getStream);

    const { result } = renderHook(() =>
      useStream(client, 1, { retries: 2, retryDelayMs: 1, maxRetryDelayMs: 4 }),
    );
    await waitFor(() => expect(result.current.stream).toEqual(first));

    getStream
      .mockRejectedValueOnce(new Error('rpc hiccup'))
      .mockRejectedValueOnce(new Error('rpc hiccup'))
      .mockResolvedValueOnce(recovered);

    await act(async () => {
      await result.current.refresh();
    });

    // One mount fetch plus the two failures and the successful retry.
    expect(getStream).toHaveBeenCalledTimes(4);
    expect(result.current.stream).toEqual(recovered);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('keeps the last good value and flags staleness while backing off', async () => {
    const first = makeStream('1');
    const getStream = vi.fn().mockResolvedValueOnce(first);
    const client = makeClient(getStream);

    const { result } = renderHook(() =>
      useStream(client, 1, { retries: 1, retryDelayMs: 20, maxRetryDelayMs: 20 }),
    );
    await waitFor(() => expect(result.current.stream).toEqual(first));

    const retry = deferred<Stream | null>();
    getStream
      .mockRejectedValueOnce(new Error('rpc hiccup'))
      .mockImplementationOnce(() => retry.promise);

    let refreshDone: Promise<void> = Promise.resolve();
    act(() => {
      refreshDone = result.current.refresh();
    });

    // The first attempt failed and the second is parked on `retry`.
    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(3));
    expect(result.current.stream).toEqual(first);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(true);

    retry.resolve(first);
    await act(async () => {
      await refreshDone;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });

  it('sets the error only after every retry is exhausted, keeping the last value', async () => {
    const first = makeStream('1');
    const getStream = vi.fn().mockResolvedValueOnce(first);
    const client = makeClient(getStream);

    const { result } = renderHook(() =>
      useStream(client, 1, { retries: 2, retryDelayMs: 1, maxRetryDelayMs: 2 }),
    );
    await waitFor(() => expect(result.current.stream).toEqual(first));

    getStream.mockRejectedValue(new Error('rpc down'));

    await act(async () => {
      await result.current.refresh();
    });

    // Mount plus three attempts (the initial one and two retries).
    expect(getStream).toHaveBeenCalledTimes(4);
    expect(result.current.error).toBe('rpc down');
    expect(result.current.isStale).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.stream).toEqual(first);
  });

  it('clears the stream without touching the client when the id is null', async () => {
    const getStream = vi.fn();
    const client = makeClient(getStream);

    const { result } = renderHook(() => useStream(client, null));

    await act(async () => {
      await result.current.refresh();
    });

    expect(getStream).not.toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.isStale).toBe(false);
  });
});
