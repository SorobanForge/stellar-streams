import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iterateStreams } from './index.js';
import { PUBLIC_KEY, createdEvent, eventsPage, mockRpc, streamScVal } from './test-helpers';
import { StreamsClient } from './index.js';

const CONTRACT_ID_LOCAL = 'C'.padEnd(56, '1');

function makeIterClient(): StreamsClient {
  return new StreamsClient({
    contractId: CONTRACT_ID_LOCAL,
    rpcUrl: 'https://rpc.invalid',
    networkPassphrase: 'Test SDF Network ; September 2015',
    publicKey: PUBLIC_KEY,
    pollIntervalMs: 1,
    pollTimeoutMs: 200,
  });
}

describe('iterateStreams (#328)', () => {
  let rpc: ReturnType<typeof mockRpc>;
  let client: StreamsClient;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields streams from two pages then stops', async () => {
    const page1Events = [createdEvent(1), createdEvent(2)];
    const page2Events = [createdEvent(3)];

    rpc.simulateTransaction.mockImplementation(async () =>
      (await import('./test-helpers')).simulationSuccess(streamScVal()),
    );

    // Page 1 returns cursor X, page 2 returns empty cursor.
    const page1Cursor = '0000000005000-0000000002';
    const page2Cursor = '0000000005000-0000000003';
    rpc.getEvents
      .mockResolvedValueOnce(eventsPage(page1Events, { cursor: page1Cursor }))
      .mockResolvedValueOnce(eventsPage(page2Events, { cursor: page2Cursor }))
      .mockResolvedValueOnce(eventsPage([]));

    client = makeIterClient();
    const collected: bigint[] = [];
    for await (const stream of iterateStreams({ client, address: PUBLIC_KEY, pageSize: 2 })) {
      collected.push(stream.id);
    }
    expect(collected).toHaveLength(3);
    expect(collected).toContain(1n);
    expect(collected).toContain(2n);
    expect(collected).toContain(3n);
  });

  it('stops immediately on an empty page', async () => {
    rpc.getEvents.mockResolvedValue(eventsPage([]));

    client = makeIterClient();
    const collected: unknown[] = [];
    for await (const stream of iterateStreams({ client, address: PUBLIC_KEY })) {
      collected.push(stream);
    }
    expect(collected).toHaveLength(0);
  });

  it('stops when the cursor does not advance (infinite-loop guard)', async () => {
    const sameCursor = '0000000005000-0000000001';
    const events = [createdEvent(1)];
    rpc.simulateTransaction.mockImplementation(async () =>
      (await import('./test-helpers')).simulationSuccess(streamScVal()),
    );
    // Both pages return the identical cursor — the guard must stop after page 2.
    rpc.getEvents
      .mockResolvedValueOnce(eventsPage(events, { cursor: sameCursor }))
      .mockResolvedValueOnce(eventsPage(events, { cursor: sameCursor }));

    client = makeIterClient();
    const collected: bigint[] = [];
    for await (const stream of iterateStreams({ client, address: PUBLIC_KEY })) {
      collected.push(stream.id);
    }
    // Should stop after detecting the repeated cursor — at most 2 items (one per page shown).
    expect(rpc.getEvents.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('aborts between pages when the signal fires', async () => {
    const controller = new AbortController();
    const events = [createdEvent(1)];
    const nextCursor = '0000000005000-0000000001';
    rpc.simulateTransaction.mockImplementation(async () =>
      (await import('./test-helpers')).simulationSuccess(streamScVal()),
    );
    rpc.getEvents
      .mockImplementationOnce(async () => {
        controller.abort();
        return eventsPage(events, { cursor: nextCursor });
      })
      .mockResolvedValue(eventsPage([createdEvent(2)], { cursor: '0000000005000-0000000002' }));

    client = makeIterClient();
    const gen = iterateStreams({ client, address: PUBLIC_KEY, signal: controller.signal });
    // First yield succeeds; the generator should then throw on the aborted next page.
    await gen.next(); // stream 1
    await expect(gen.next()).rejects.toThrow(/aborted/i);
  });
});
