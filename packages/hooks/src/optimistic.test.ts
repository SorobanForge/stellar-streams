import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useCancelStream, useStream, useWithdrawStream } from './index';

/** A promise plus its reject, so a test can hold a write in flight. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
 * A fake client backed by a mutable stream value: writes update the value, so
 * the refetch a hook triggers after a confirmed transaction sees the new state.
 */
function makeClient(initial: Stream) {
  let current = initial;
  const getStream = vi.fn(async () => current);
  const claimable = vi.fn(async () => 0n);
  return {
    getStream,
    setCurrent(next: Stream) {
      current = next;
    },
    client: { getStream, claimable } as unknown as StreamsClient,
  };
}

describe('optimistic stream mutations', () => {
  it('increases withdrawn while a withdraw is in flight, then refetches', async () => {
    const base = makeStream();
    const { client, getStream, setCurrent } = makeClient(base);
    const gate = deferred<{ hash: string }>();
    const withdraw = vi.fn(() => gate.promise);
    Object.assign(client, { withdraw });

    const { result } = renderHook(() => ({
      view: useStream(client, '1'),
      action: useWithdrawStream(client),
    }));

    await waitFor(() => expect(result.current.view.stream).toEqual(base));
    expect(getStream).toHaveBeenCalledTimes(1);

    let submitted: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      submitted = result.current.action.mutate('1', 40n);
    });

    // The write is still pending, yet the displayed stream already moved.
    await waitFor(() => expect(result.current.view.stream?.withdrawn).toBe('40'));
    expect(result.current.action.status).toBe('pending');

    setCurrent(makeStream({ withdrawn: '40' }));
    await act(async () => {
      gate.resolve({ hash: 'tx-withdraw' });
      await submitted;
    });

    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(2));
    expect(result.current.view.stream?.withdrawn).toBe('40');
    expect(result.current.action.status).toBe('success');
  });

  it('rolls a failed withdraw back to the previous value', async () => {
    const base = makeStream({ withdrawn: '5' });
    const { client } = makeClient(base);
    const gate = deferred<{ hash: string }>();
    const withdraw = vi.fn(() => gate.promise);
    Object.assign(client, { withdraw });

    const { result } = renderHook(() => ({
      view: useStream(client, '1'),
      action: useWithdrawStream(client),
    }));

    await waitFor(() => expect(result.current.view.stream).toEqual(base));

    let submitted: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      submitted = result.current.action.mutate('1', 10n);
    });
    await waitFor(() => expect(result.current.view.stream?.withdrawn).toBe('15'));

    await act(async () => {
      gate.reject(new Error('nothing to withdraw'));
      await submitted;
    });

    expect(result.current.view.stream?.withdrawn).toBe('5');
    expect(result.current.action.status).toBe('error');
    expect(result.current.action.error).toBe('nothing to withdraw');
  });

  it('marks a stream cancelled while a cancel is in flight', async () => {
    const base = makeStream({ withdrawn: '200' });
    const { client, setCurrent } = makeClient(base);
    const gate = deferred<{ hash: string }>();
    const cancel = vi.fn(() => gate.promise);
    Object.assign(client, { cancel });

    const { result } = renderHook(() => ({
      view: useStream(client, 1),
      action: useCancelStream(client),
    }));

    await waitFor(() => expect(result.current.view.stream).toEqual(base));

    let submitted: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      submitted = result.current.action.mutate(1);
    });
    await waitFor(() => expect(result.current.view.stream?.cancelled).toBe(true));

    setCurrent(makeStream({ withdrawn: '200', cancelled: true }));
    await act(async () => {
      gate.resolve({ hash: 'tx-cancel' });
      await submitted;
    });

    await waitFor(() => expect(result.current.view.loading).toBe(false));
    expect(result.current.view.stream?.cancelled).toBe(true);
    expect(result.current.action.status).toBe('success');
  });

  it('keeps concurrent mutations independent when one rolls back', async () => {
    const base = makeStream();
    const { client, setCurrent } = makeClient(base);
    const withdrawGate = deferred<{ hash: string }>();
    const cancelGate = deferred<{ hash: string }>();
    const withdraw = vi.fn(() => withdrawGate.promise);
    const cancel = vi.fn(() => cancelGate.promise);
    Object.assign(client, { withdraw, cancel });

    const { result } = renderHook(() => ({
      view: useStream(client, '1'),
      withdraw: useWithdrawStream(client),
      cancel: useCancelStream(client),
    }));

    await waitFor(() => expect(result.current.view.stream).toEqual(base));

    let withdrawing: Promise<{ hash: string } | null> = Promise.resolve(null);
    let cancelling: Promise<{ hash: string } | null> = Promise.resolve(null);
    act(() => {
      withdrawing = result.current.withdraw.mutate('1', 25n);
      cancelling = result.current.cancel.mutate('1');
    });

    await waitFor(() => {
      expect(result.current.view.stream?.withdrawn).toBe('25');
      expect(result.current.view.stream?.cancelled).toBe(true);
    });

    // The withdraw fails: only its own change is undone.
    await act(async () => {
      withdrawGate.reject(new Error('rejected by contract'));
      await withdrawing;
    });

    expect(result.current.view.stream?.withdrawn).toBe('0');
    expect(result.current.view.stream?.cancelled).toBe(true);
    expect(result.current.withdraw.status).toBe('error');
    expect(result.current.cancel.status).toBe('pending');

    setCurrent(makeStream({ cancelled: true }));
    await act(async () => {
      cancelGate.resolve({ hash: 'tx-cancel' });
      await cancelling;
    });

    await waitFor(() => expect(result.current.view.loading).toBe(false));
    expect(result.current.view.stream?.withdrawn).toBe('0');
    expect(result.current.view.stream?.cancelled).toBe(true);
  });

  it('still submits a withdraw when no optimistic amount is given', async () => {
    const base = makeStream();
    const { client } = makeClient(base);
    const withdraw = vi.fn().mockResolvedValue({ hash: 'tx-plain' });
    Object.assign(client, { withdraw });

    const { result } = renderHook(() => ({
      view: useStream(client, '1'),
      action: useWithdrawStream(client),
    }));
    await waitFor(() => expect(result.current.view.stream).toEqual(base));

    await act(async () => {
      expect(await result.current.action.mutate('1')).toEqual({ hash: 'tx-plain' });
    });

    expect(withdraw).toHaveBeenCalledWith('1');
    expect(result.current.view.stream?.withdrawn).toBe('0');
  });
});
