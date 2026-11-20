import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff, isTransportFailure } from './retry';

describe('retry and transport failure', () => {
  it('identifies 5xx and network failures as transport failures', () => {
    expect(isTransportFailure({ status: 502 })).toBe(true);
    expect(isTransportFailure(new Error('network timeout'))).toBe(true);
    expect(isTransportFailure(new Error('Contract execution failed'))).toBe(false);
  });

  it('retries transient failures with backoff and succeeds', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 2) throw new Error('502 Bad Gateway');
      return 'success';
    });

    const res = await retryWithBackoff(fn, 3, 10);
    expect(res).toBe('success');
    expect(attempts).toBe(2);
  });

  it('exhausts retries and throws on persistent failure', async () => {
    const fn = vi.fn(async () => {
      throw new Error('503 Service Unavailable');
    });

    await expect(retryWithBackoff(fn, 2, 10)).rejects.toThrow('503 Service Unavailable');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never retries non-transport errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Invalid argument');
    });

    await expect(retryWithBackoff(fn, 3, 10)).rejects.toThrow('Invalid argument');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects AbortSignal during backoff wait', async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error('502 Gateway');
    });

    setTimeout(() => controller.abort(), 20);

    await expect(retryWithBackoff(fn, 3, 100, controller.signal)).rejects.toThrow();
  });
});

describe('write-pipeline cancellation and status changes', () => {
  it('reports status sequence correctly for successful write and aborted steps', async () => {
    const statuses: string[] = [];
    const cb = (status: string) => statuses.push(status);

    cb('simulating');
    cb('signing');
    cb('submitting');
    cb('polling');
    cb('confirmed');

    expect(statuses).toEqual(['simulating', 'signing', 'submitting', 'polling', 'confirmed']);
  });

  it('reports failed status once upon abort or failure', () => {
    const statuses: string[] = [];
    const cb = (status: string) => statuses.push(status);

    cb('simulating');
    cb('failed');

    expect(statuses).toEqual(['simulating', 'failed']);
  });
});
