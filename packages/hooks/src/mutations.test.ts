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

  it('pauses a stream and surfaces success', async () => {
    const pause = vi.fn().mockResolvedValue({ hash: 'tx-pause' });
    const client = { pause } as unknown as StreamsClient;
    const onSuccess = vi.fn();

    const { result } = renderHook(() => usePauseStream(client, { onSuccess }));

    await act(async () => {
      expect(await result.current.mutate(7)).toEqual({ hash: 'tx-pause' });
    });

    expect(pause).toHaveBeenCalledWith(7);
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-pause' });
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-pause');
  });

  it('resumes a stream and surfaces success', async () => {
    const resume = vi.fn().mockResolvedValue({ hash: 'tx-resume' });
    const client = { resume } as unknown as StreamsClient;
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useResumeStream(client, { onSuccess }));

    await act(async () => {
      expect(await result.current.mutate(7)).toEqual({ hash: 'tx-resume' });
    });

    expect(resume).toHaveBeenCalledWith(7);
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-resume' });
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-resume');
  });

  it('surfaces an error when pause fails', async () => {
    const pause = vi.fn().mockRejectedValue(new Error('unauthorized'));
    const client = { pause } as unknown as StreamsClient;
    const onError = vi.fn();

    const { result } = renderHook(() => usePauseStream(client, { onError }));

    await act(async () => {
      expect(await result.current.mutate(7)).toBeNull();
    });

    expect(pause).toHaveBeenCalledWith(7);
    expect(onError).toHaveBeenCalledWith('unauthorized');
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('unauthorized');
  });

  it('tops up a stream with a validated amount and refreshes readers', async () => {
    const topUp = vi.fn().mockResolvedValue({ hash: 'tx-top-up' });
    const client = { topUp } as unknown as StreamsClient;
    const onSuccess = vi.fn();

    const { result } = renderHook(() => useTopUpStream(client, { onSuccess }));

    await act(async () => {
      expect(await result.current.mutate({ id: 3, amount: '250' })).toEqual({
        hash: 'tx-top-up',
      });
    });

    expect(topUp).toHaveBeenCalledWith(3, 250n);
    expect(result.current.status).toBe('success');
    expect(result.current.hash).toBe('tx-top-up');
    expect(onSuccess).toHaveBeenCalledWith({ hash: 'tx-top-up' });
  });

  it('rejects a non-positive top-up before calling the client', async () => {
    const topUp = vi.fn();
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 3, amount: '0' })).toBeNull();
    });

    expect(topUp).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/greater than zero/i);
  });

  it('carries the contract error code of a rejected top-up', async () => {
    const topUp = vi.fn().mockRejectedValue(
      Object.assign(new Error('Simulation of top_up failed'), {
        code: 'STREAM_COMPLETED',
      }),
    );
    const client = { topUp } as unknown as StreamsClient;

    const { result } = renderHook(() => useTopUpStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 3, amount: '250' })).toBeNull();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('STREAM_COMPLETED');
  });
});
