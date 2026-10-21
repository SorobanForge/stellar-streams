import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearRequestCache, dedupeRequest, pendingRequestCount } from './request-cache';

/** Resolves/rejects a promise from the test body. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('dedupeRequest', () => {
  beforeEach(() => {
    clearRequestCache();
  });

  it('runs the loader once for concurrent identical reads', async () => {
    const scope = {};
    const gate = deferred<string>();
    const load = vi.fn(() => gate.promise);

    const first = dedupeRequest(scope, 'stream:1', load);
    const second = dedupeRequest(scope, 'stream:1', load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    gate.resolve('stream');
    await expect(first).resolves.toBe('stream');
    await expect(second).resolves.toBe('stream');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not share reads across different keys', async () => {
    const scope = {};
    const load = vi.fn(async () => 'value');

    await Promise.all([
      dedupeRequest(scope, 'stream:1', load),
      dedupeRequest(scope, 'stream:2', load),
    ]);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not share reads across different scopes', async () => {
    const load = vi.fn(async () => 'value');

    await Promise.all([dedupeRequest({}, 'stream:1', load), dedupeRequest({}, 'stream:1', load)]);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('drops the entry once the promise settles', async () => {
    const scope = {};
    const load = vi.fn(async () => 'value');

    await dedupeRequest(scope, 'stream:1', load);
    expect(pendingRequestCount(scope)).toBe(0);

    await dedupeRequest(scope, 'stream:1', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares a rejection and does not cache it', async () => {
    const scope = {};
    const gate = deferred<string>();
    const load = vi.fn(() => gate.promise);

    const first = dedupeRequest(scope, 'stream:1', load);
    const second = dedupeRequest(scope, 'stream:1', load);
    expect(load).toHaveBeenCalledTimes(1);

    gate.reject(new Error('rpc down'));
    await expect(first).rejects.toThrow('rpc down');
    await expect(second).rejects.toThrow('rpc down');
    expect(pendingRequestCount(scope)).toBe(0);

    // A later read retries instead of replaying the failure.
    load.mockResolvedValueOnce('recovered');
    await expect(dedupeRequest(scope, 'stream:1', load)).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('turns a synchronous throw into a rejection and does not cache it', async () => {
    const scope = {};
    const load = vi.fn(() => {
      throw new Error('sync boom');
    });

    await expect(dedupeRequest(scope, 'stream:1', load)).rejects.toThrow('sync boom');
    expect(pendingRequestCount(scope)).toBe(0);
  });

  it('clearRequestCache stops sharing pending reads', async () => {
    const scope = {};
    const gate = deferred<string>();
    const load = vi.fn(() => gate.promise);

    const first = dedupeRequest(scope, 'stream:1', load);
    clearRequestCache();
    const second = dedupeRequest(scope, 'stream:1', load);

    expect(load).toHaveBeenCalledTimes(2);
    gate.resolve('done');
    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('done');
  });
});
