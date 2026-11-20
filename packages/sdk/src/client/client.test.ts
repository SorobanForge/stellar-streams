import { describe, it, expect, vi } from 'vitest';
import { StellarStreamsClient } from './stream';

describe('StellarStreamsClient Integration', () => {
  it('supports onStatusChange callbacks and per-call overrides', async () => {
    const globalStatuses: string[] = [];
    const callStatuses: string[] = [];

    const client = new StellarStreamsClient({
      onStatusChange: (status) => globalStatuses.push(status),
    });

    await client.executeWrite(async () => 'done', {
      onStatusChange: (status) => callStatuses.push(status),
    });

    expect(globalStatuses).toEqual(['simulating', 'signing', 'submitting', 'polling', 'confirmed']);
    expect(callStatuses).toEqual(['simulating', 'signing', 'submitting', 'polling', 'confirmed']);
  });

  it('reports failed status and error when write is aborted before simulation', async () => {
    const statuses: string[] = [];
    const controller = new AbortController();
    controller.abort();

    const client = new StellarStreamsClient();

    await expect(
      client.executeWrite(async () => 'done', {
        signal: controller.signal,
        onStatusChange: (status) => statuses.push(status),
      }),
    ).rejects.toThrow();

    expect(statuses).toContain('failed');
  });
});
