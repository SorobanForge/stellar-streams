import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useStream } from './index';
import { clearRequestCache } from './request-cache';

const stream: Stream = {
  id: '1',
  sender: 'GSENDER',
  recipient: 'GRECIPIENT',
  token: 'CTOKEN',
  totalAmount: '100',
  withdrawn: '0',
  startTime: 0,
  endTime: 1_000,
  cliffTime: 0,
  cancelled: false,
  label: '',
  reference: '',
};

function makeClient() {
  const getStream = vi.fn().mockResolvedValue(stream);
  const claimable = vi.fn().mockResolvedValue(0n);
  return { getStream, client: { getStream, claimable } as unknown as StreamsClient };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Flushes the mount effect and its resolved reads under fake timers. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

describe('useStream polling state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearRequestCache();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('reports polling while the tab is visible', async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useStream(client, 1, { pollMs: 1_000 }));

    await flush();

    expect(result.current.stream).toEqual(stream);
    expect(result.current.isPolling).toBe(true);
    expect(result.current.lastUpdatedAt).not.toBeNull();
  });

  it('pauses while hidden and resumes with a refresh when visible again', async () => {
    const { getStream, client } = makeClient();
    const { result } = renderHook(() => useStream(client, 1, { pollMs: 1_000 }));

    await flush();
    expect(result.current.isPolling).toBe(true);
    const updatedAt = result.current.lastUpdatedAt;

    act(() => setVisibility('hidden'));
    expect(result.current.isPolling).toBe(false);

    // A hidden tab must not poll.
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(getStream).toHaveBeenCalledTimes(1);
    expect(result.current.lastUpdatedAt).toBe(updatedAt);

    act(() => setVisibility('visible'));
    await flush();
    expect(result.current.isPolling).toBe(true);
    expect(getStream).toHaveBeenCalledTimes(2);
    expect(result.current.lastUpdatedAt).toBeGreaterThanOrEqual(updatedAt!);
  });

  it('polls on the interval while visible', async () => {
    const { getStream, client } = makeClient();
    const { result } = renderHook(() => useStream(client, 1, { pollMs: 1_000 }));

    await flush();
    expect(result.current.isPolling).toBe(true);
    expect(getStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    await flush();

    expect(getStream).toHaveBeenCalledTimes(3);
  });

  it('is not polling when no interval is configured and leaves existing fields intact', async () => {
    const { client } = makeClient();
    const { result } = renderHook(() => useStream(client, 1));

    await flush();

    expect(result.current.isPolling).toBe(false);
    expect(result.current.lastUpdatedAt).not.toBeNull();
    expect(result.current.stream).toEqual(stream);
    expect(result.current.claimable).toBe(0n);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isStale).toBe(false);
  });
});
