import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStream } from './index';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';

const STREAM: Stream = {
  id: '1',
  sender: 'GSENDER',
  recipient: 'GRECIPIENT',
  token: 'CTOKEN',
  totalAmount: '1000',
  withdrawn: '0',
  startTime: 0,
  endTime: 100,
  cliffTime: 0,
  cancelled: false,
};

interface MockClient {
  getStream: ReturnType<typeof vi.fn>;
  claimable: ReturnType<typeof vi.fn>;
}

/** Builds a `StreamsClient` stand-in whose two reads are mocks we can assert on. */
function createClient(overrides: Partial<MockClient> = {}): MockClient {
  return {
    getStream: vi.fn().mockResolvedValue(STREAM),
    claimable: vi.fn().mockResolvedValue(7n),
    ...overrides,
  };
}

const asClient = (client: MockClient) => client as unknown as StreamsClient;

describe('useStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads a stream and its claimable balance', async () => {
    const client = createClient();

    const { result } = renderHook(() => useStream(asClient(client), 1n));

    await waitFor(() => expect(result.current.stream).toEqual(STREAM));

    expect(result.current.claimable).toBe(7n);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(client.getStream).toHaveBeenCalledWith(1n);
    expect(client.claimable).toHaveBeenCalledWith(1n);
  });

  it('reports a null stream when the id does not exist', async () => {
    const client = createClient({
      getStream: vi.fn().mockResolvedValue(null),
      claimable: vi.fn().mockResolvedValue(0n),
    });

    const { result } = renderHook(() => useStream(asClient(client), 42n));

    await waitFor(() => expect(client.getStream).toHaveBeenCalledTimes(1));

    expect(result.current.stream).toBeNull();
    expect(result.current.claimable).toBe(0n);
    expect(result.current.error).toBeNull();
  });

  it('captures an error thrown by getStream', async () => {
    const client = createClient({
      getStream: vi.fn().mockRejectedValue(new Error('stream not found')),
    });

    const { result } = renderHook(() => useStream(asClient(client), 1n));

    await waitFor(() => expect(result.current.error).toBe('stream not found'));

    expect(result.current.stream).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('falls back to a zero claimable balance when claimable fails', async () => {
    const client = createClient({
      claimable: vi.fn().mockRejectedValue(new Error('claimable unavailable')),
    });

    const { result } = renderHook(() => useStream(asClient(client), 1n));

    await waitFor(() => expect(result.current.stream).toEqual(STREAM));

    expect(result.current.claimable).toBe(0n);
    expect(result.current.error).toBeNull();
  });

  it('does not call the client without a client or an id', () => {
    const client = createClient();

    const withoutId = renderHook(() => useStream(asClient(client), null));
    const withoutClient = renderHook(() => useStream(null, 1n));

    expect(withoutId.result.current.stream).toBeNull();
    expect(withoutId.result.current.loading).toBe(false);
    expect(withoutClient.result.current.stream).toBeNull();
    expect(withoutClient.result.current.claimable).toBe(0n);
    expect(client.getStream).not.toHaveBeenCalled();
    expect(client.claimable).not.toHaveBeenCalled();
  });

  it('re-fetches the stream on every polling tick', async () => {
    vi.useFakeTimers();
    const client = createClient();

    renderHook(() => useStream(asClient(client), 1n, 1_000));

    // Flush the initial load triggered on mount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.getStream).toHaveBeenCalledTimes(1);

    // One poll interval later the hook fetches the stream again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(client.getStream).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(client.getStream).toHaveBeenCalledTimes(3);
  });
});
