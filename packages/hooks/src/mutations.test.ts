import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { CreateStreamParams } from '@stellar-starter-kit/types';
import {
  useCancelStream,
  useCreateStream,
  usePauseStream,
  useResumeStream,
  useTopUpStream,
  useWithdrawStream,
} from './index';

/** A promise plus its resolver, so a test can hold a mutation in flight. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A rejection shaped like the SDK's `StreamsError`, without importing the built package. */
function streamsError(message: string, contractCode: number): Error {
  return Object.assign(new Error(message), { name: 'StreamsError', contractCode });
}

const params: CreateStreamParams = {
  sender: 'GSENDER',
  recipient: 'GRECIPIENT',
  token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  amount: '10000000',
  startTime: 0,
  endTime: 1_000,
  cliffTime: 0,
};

describe('stream mutation hooks', () => {
  it('creates a stream, reports the confirmed hash, and resets', async () => {
    const createStream = vi.fn().mockResolvedValue({ hash: 'tx-create' });
    const client = { createStream } as unknown as StreamsClient;
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useCreateStream(client, { onSuccess }));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.hash).toBeNull();

    let submitted: { hash: string } | null = null;
    await act(async () => {
      submitted = await result.current.mutate(params);
    });

    expect(createStream).toHaveBeenCalledWith(params);
    expect(submitted).toEqual({ hash: 'tx-create' });
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-create' });
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-create');
    expect(result.current.error).toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.hash).toBeNull();
  });

  it('ignores a second mutate while the first is still in flight', async () => {
    const gate = deferred<{ hash: string }>();
    const createStream = vi.fn(() => gate.promise);
    const client = { createStream } as unknown as StreamsClient;

    const { result } = renderHook(() => useCreateStream(client));

    let inFlight: Promise<{ hash: string } | null> = Promise.resolve(null);
    await act(async () => {
      inFlight = result.current.mutate(params);
    });

    expect(result.current.status).toBe('pending');
    expect(createStream).toHaveBeenCalledTimes(1);

    let skipped: { hash: string } | null = { hash: 'should-not-land' };
    await act(async () => {
      skipped = await result.current.mutate(params);
    });

    // The second call is a documented no-op: the SDK is not called again.
    expect(skipped).toBeNull();
    expect(createStream).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('pending');

    gate.resolve({ hash: 'tx-late' });
    await act(async () => {
      await inFlight;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-late');
  });

  it('surfaces a failed withdraw without recording a hash', async () => {
    const withdraw = vi.fn().mockRejectedValue(new Error('nothing to withdraw'));
    const client = { withdraw } as unknown as StreamsClient;
    const onError = vi.fn();

    const { result } = renderHook(() => useWithdrawStream(client, { onError }));

    let submitted: { hash: string } | null = { hash: 'should-not-land' };
    await act(async () => {
      submitted = await result.current.mutate('42');
    });

    expect(withdraw).toHaveBeenCalledWith('42');
    expect(submitted).toBeNull();
    expect(onError).toHaveBeenCalledWith('nothing to withdraw');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('nothing to withdraw');
    expect(result.current.hash).toBeNull();
  });

  it('cancels a stream', async () => {
    const cancel = vi.fn().mockResolvedValue({ hash: 'tx-cancel' });
    const client = { cancel } as unknown as StreamsClient;

    const { result } = renderHook(() => useCancelStream(client));

    await act(async () => {
      expect(await result.current.mutate(7)).toEqual({ hash: 'tx-cancel' });
    });

    expect(cancel).toHaveBeenCalledWith(7);
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-cancel');
  });

  it('is a no-op without a connected client', async () => {
    const { result } = renderHook(() => useCancelStream(null));

    await act(async () => {
      expect(await result.current.mutate(7)).toBeNull();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});

describe('stream control mutation hooks', () => {
  it.each(['pause', 'resume'] as const)('%s walks idle -> pending -> success', async (method) => {
    const gate = deferred<{ hash: string }>();
    const call = vi.fn(() => gate.promise);
    const client = { [method]: call } as unknown as StreamsClient;
    const controller = new AbortController();

    const { result } = renderHook(() =>
      method === 'pause' ? usePauseStream(client) : useResumeStream(client),
    );

    expect(result.current.status).toBe('idle');

    let inFlight: Promise<{ hash: string } | null> = Promise.resolve(null);
    await act(async () => {
      inFlight = result.current.mutate(7, { signal: controller.signal });
    });

    expect(result.current.status).toBe('pending');
    expect(call).toHaveBeenCalledWith(7, { signal: controller.signal });

    gate.resolve({ hash: `tx-${method}` });
    await act(async () => {
      await inFlight;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe(`tx-${method}`);
    expect(result.current.error).toBeNull();
  });

  it.each(['pause', 'resume'] as const)('%s keeps the StreamsError code', async (method) => {
    const message = `Simulation of ${method} failed: STREAM_PAUSED (contract error #16) — HostError`;
    const call = vi.fn().mockRejectedValue(streamsError(message, 16));
    const client = { [method]: call } as unknown as StreamsClient;
    const onError = vi.fn();

    const { result } = renderHook(() =>
      method === 'pause'
        ? usePauseStream(client, { onError })
        : useResumeStream(client, { onError }),
    );

    await act(async () => {
      expect(await result.current.mutate(3)).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('STREAM_PAUSED');
    expect(result.current.error).toContain('contract error #16');
    expect(onError).toHaveBeenCalledWith(message);
  });

  it('ignores a write that settles after unmount', async () => {
    const gate = deferred<{ hash: string }>();
    const pause = vi.fn(() => gate.promise);
    const client = { pause } as unknown as StreamsClient;
    const onSuccess = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result, unmount } = renderHook(() => usePauseStream(client, { onSuccess }));

    let inFlight: Promise<{ hash: string } | null> = Promise.resolve(null);
    await act(async () => {
      inFlight = result.current.mutate(1);
    });

    unmount();
    gate.resolve({ hash: 'tx-late' });
    await act(async () => {
      await inFlight;
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('useTopUpStream', () => {
  it('validates the amount, calls topUp, and exposes the confirmed hash', async () => {
    const topUp = vi.fn().mockResolvedValue({ hash: 'tx-top-up' });
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 7, amount: '500' })).toEqual({
        hash: 'tx-top-up',
      });
    });

    expect(topUp).toHaveBeenCalledWith(7, 500n);
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-top-up');
  });

  it.each(['0', '-5', '1.5', 'abc', 0, 1.5, 0n] as const)(
    'rejects %s before the client call',
    async (amount) => {
      const topUp = vi.fn().mockResolvedValue({ hash: 'never' });
      const client = { topUp } as unknown as StreamsClient;

      const { result } = renderHook(() => useTopUpStream(client));

      await act(async () => {
        expect(await result.current.mutate({ id: 1, amount })).toBeNull();
      });

      expect(topUp).not.toHaveBeenCalled();
      expect(result.current.status).toBe('error');
      expect(result.current.error).toContain('Must be a positive integer');
    },
  );

  it('surfaces STREAM_COMPLETED unchanged', async () => {
    const message =
      'Simulation of top_up failed: STREAM_COMPLETED (contract error #18) — HostError';
    const topUp = vi.fn().mockRejectedValue(streamsError(message, 18));
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 1, amount: '100' })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(message);
  });

  it('surfaces AMOUNT_OVERFLOW unchanged', async () => {
    const message = 'Simulation of top_up failed: AMOUNT_OVERFLOW (contract error #19) — HostError';
    const topUp = vi.fn().mockRejectedValue(streamsError(message, 19));
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    await act(async () => {
      await result.current.mutate({ id: 1, amount: '999999999999999999999' });
    });

    expect(result.current.error).toBe(message);
  });

  it('ignores a double submit while the first top-up is in flight', async () => {
    const gate = deferred<{ hash: string }>();
    const topUp = vi.fn(() => gate.promise);
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    let inFlight: Promise<{ hash: string } | null> = Promise.resolve(null);
    await act(async () => {
      inFlight = result.current.mutate({ id: 5, amount: 10 });
    });

    expect(result.current.status).toBe('pending');

    await act(async () => {
      expect(await result.current.mutate({ id: 5, amount: 10 })).toBeNull();
    });

    expect(topUp).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('pending');

    gate.resolve({ hash: 'tx-once' });
    await act(async () => {
      await inFlight;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-once');
  });
});
