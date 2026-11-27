import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(result.current.isPolling).toBe(false);
    expect(result.current.lastUpdatedAt).toBeNull();
  });
});

describe('useStream polling and visibility', () => {
  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');

  function setVisibilityState(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: state,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
    } else {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
    }
  });

  it('tracks isPolling and lastUpdatedAt across visible and hidden states', async () => {
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);
    setVisibilityState('visible');

    const first = makeStream('1', '100');
    const second = makeStream('1', '200');
    const third = makeStream('1', '300');
    const getStream = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);
    const client = makeClient(getStream);

    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useStream(client, 1, { pollMs: 5_000, retryDelayMs: 1 });
    });

    expect(result.current.isPolling).toBe(true);
    expect(result.current.lastUpdatedAt).toBeNull();

    // Flush the initial mount fetch.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.stream).toEqual(first);
    expect(result.current.lastUpdatedAt).toBe(t0);
    expect(result.current.isPolling).toBe(true);
    expect(getStream).toHaveBeenCalledTimes(1);

    // Advance by one polling interval while visible.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(getStream).toHaveBeenCalledTimes(2);
    expect(result.current.stream).toEqual(second);
    expect(result.current.lastUpdatedAt).toBe(t0 + 5_000);

    // Hide the tab: polling suspends and no further interval ticks fire.
    const rendersBeforeHide = renderCount;
    act(() => {
      setVisibilityState('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isPolling).toBe(false);
    expect(renderCount - rendersBeforeHide).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(getStream).toHaveBeenCalledTimes(2);
    expect(result.current.lastUpdatedAt).toBe(t0 + 5_000);

    // Return to visible: polling resumes with an immediate refresh.
    const rendersBeforeShow = renderCount;
    await act(async () => {
      setVisibilityState('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isPolling).toBe(true);
    expect(getStream).toHaveBeenCalledTimes(3);
    expect(result.current.stream).toEqual(third);
    expect(result.current.lastUpdatedAt).toBe(t0 + 20_000);
    expect(renderCount - rendersBeforeShow).toBeLessThanOrEqual(4);
  });

  it('starts with isPolling false when mounted in a hidden tab', async () => {
    vi.useFakeTimers();
    setVisibilityState('hidden');

    const getStream = vi.fn().mockResolvedValue(makeStream('1'));
    const client = makeClient(getStream);

    const { result } = renderHook(() => useStream(client, 1, { pollMs: 5_000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isPolling).toBe(false);
    expect(getStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(getStream).toHaveBeenCalledTimes(1);
  });

  it('keeps isPolling false when polling is disabled', async () => {
    vi.useFakeTimers();
    setVisibilityState('visible');

    const getStream = vi.fn().mockResolvedValue(makeStream('1'));
    const client = makeClient(getStream);

    const { result } = renderHook(() => useStream(client, 1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isPolling).toBe(false);
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });
});
