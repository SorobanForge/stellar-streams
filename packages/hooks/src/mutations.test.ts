import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { CreateStreamParams } from '@stellar-starter-kit/types';
import {
  useCancelStream,
  useCreateStream,
  useReduceStream,
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

  it('tops up a stream with a validated amount', async () => {
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

  it('reduces a stream and keeps the contract error code', async () => {
    const reduceStream = vi.fn().mockRejectedValue(
      Object.assign(new Error('Simulation of reduce_stream failed'), {
        code: 'REDUCTION_BELOW_VESTED',
      }),
    );
    const client = { reduceStream } as unknown as StreamsClient;

    const { result } = renderHook(() => useReduceStream(client));

    await act(async () => {
      expect(await result.current.mutate({ id: 4, newTotal: '40' })).toBeNull();
    });

    expect(reduceStream).toHaveBeenCalledWith(4, 40n);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Simulation of reduce_stream failed');
    expect(result.current.errorCode).toBe('REDUCTION_BELOW_VESTED');
  });

  it('clears the error code on reset', async () => {
    const reduceStream = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('rejected'), { code: 'INVALID_REDUCTION' }));
    const client = { reduceStream } as unknown as StreamsClient;

    const { result } = renderHook(() => useReduceStream(client));

    await act(async () => {
      await result.current.mutate({ id: 4, newTotal: '40' });
    });
    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.errorCode).toBeNull();
  });
});
