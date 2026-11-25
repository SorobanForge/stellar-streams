import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, scValToNative, xdr } from '@stellar/stellar-sdk';
import { InvalidCursorError } from './index.js';
import {
  CONTRACT_ID,
  LATEST_LEDGER,
  PUBLIC_KEY,
  createdEvent,
  eventsPage,
  invokedArgs,
  invokedCall,
  makeClient,
  mockRpc,
  simulationSuccess,
  streamScVal,
} from './test-helpers';

/** Another account, used for streams the searched-for address is not part of. */
const OTHER = Keypair.random().publicKey();

/** The base64 XDR a `getEvents` topic filter expects for a symbol. */
const b64Symbol = (symbol: string) => xdr.ScVal.scvSymbol(symbol).toXDR('base64');

/** A TOID-shaped event id/cursor at the given ledger and event index. */
const eventId = (ledger: number, index = 1) =>
  `${(BigInt(ledger) << 32n).toString().padStart(19, '0')}-${String(index).padStart(10, '0')}`;

describe('listStreams', () => {
  let rpc: ReturnType<typeof mockRpc>;
  /** Stream ids the stubbed `get_stream` knows about; anything else is "not found". */
  let existing: bigint[];

  beforeEach(() => {
    rpc = mockRpc();
    existing = [];
    rpc.simulateTransaction.mockImplementation(async (tx) => {
      const { method, contractId } = invokedCall(tx);
      if (method !== 'get_stream') throw new Error(`Unexpected simulation of ${method}`);
      expect(contractId).toBe(CONTRACT_ID);
      const id = scValToNative(invokedArgs(tx)[0]!) as bigint;
      if (!existing.includes(id)) return simulationSuccess(xdr.ScVal.scvVoid());
      return simulationSuccess(streamScVal({ id }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pages through two getEvents responses and returns the matching streams', async () => {
    existing = [1n, 3n];
    rpc.getEvents
      .mockResolvedValueOnce(
        eventsPage(
          [
            createdEvent(1, { ledger: 12 }),
            createdEvent(2, { ledger: 13, sender: OTHER, recipient: OTHER }),
          ],
          { cursor: 'page-1' },
        ),
      )
      .mockResolvedValueOnce(
        eventsPage(
          [
            createdEvent(3, { ledger: 15, recipient: PUBLIC_KEY, sender: OTHER }),
            createdEvent(99, { ledger: 25 }),
          ],
          { cursor: 'page-2' },
        ),
      );

    const { streams } = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
      endLedger: 20,
      pageSize: 2,
    });

    // Id 1 is the caller's as sender, id 3 as recipient; id 2 belongs to
    // somebody else and id 99 is past endLedger.
    expect(streams.map((stream) => stream.id)).toEqual(['1', '3']);
    expect(rpc.getEvents).toHaveBeenCalledTimes(2);

    // Each call is an argument list, so unwrap the single request it carries.
    const [[range], [continuation]] = rpc.getEvents.mock.calls as unknown as Record<
      string,
      unknown
    >[][];
    expect(range).toEqual({
      filters: [
        {
          type: 'contract',
          contractIds: [CONTRACT_ID],
          topics: [[b64Symbol('stream'), b64Symbol('created'), '*']],
        },
      ],
      startLedger: 10,
      endLedger: 20,
      limit: 2,
    });
    // Soroban RPC forbids mixing a cursor with a ledger range, so the rest of
    // the scan continues from the cursor alone.
    expect(continuation).toEqual({ filters: range!.filters, cursor: 'page-1', limit: 2 });
    expect(continuation!.startLedger).toBeUndefined();
    expect(continuation!.endLedger).toBeUndefined();
  });

  it('defaults to the last maxLedgers of the node it asks', async () => {
    rpc.getEvents.mockResolvedValueOnce(eventsPage([]));

    const { streams } = await makeClient().listStreams({ address: PUBLIC_KEY });

    expect(streams).toEqual([]);
    expect(rpc.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(rpc.getEvents).toHaveBeenCalledTimes(1);
    expect(rpc.getEvents.mock.calls[0]).toEqual([
      expect.objectContaining({
        startLedger: LATEST_LEDGER - 1000,
        endLedger: LATEST_LEDGER,
        limit: 100,
      }),
    ]);
  });

  it('bounds the default window with maxLedgers', async () => {
    rpc.getEvents.mockResolvedValueOnce(eventsPage([]));

    await makeClient().listStreams({ address: PUBLIC_KEY, maxLedgers: 50 });

    expect(rpc.getEvents.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        startLedger: LATEST_LEDGER - 50,
        endLedger: LATEST_LEDGER,
      }),
    );
  });

  it('freezes the chain tip as the end of a scan that has no explicit endLedger', async () => {
    existing = [4n];
    rpc.getEvents
      .mockResolvedValueOnce(
        eventsPage([createdEvent(4, { ledger: 40 })], { cursor: 'page-1', latestLedger: 50 }),
      )
      .mockResolvedValueOnce(eventsPage([createdEvent(5, { ledger: 55 })], { latestLedger: 60 }));

    const { streams } = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
    });

    // Stream 5 was created after the scan started, so it is not reported.
    expect(streams.map((stream) => stream.id)).toEqual(['4']);
    expect(rpc.getEvents).toHaveBeenCalledTimes(2);
    expect(rpc.getEvents.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ startLedger: 10, limit: 100 }),
    );
  });

  it('stops paging once a page comes back empty', async () => {
    existing = [6n];
    rpc.getEvents
      .mockResolvedValueOnce(eventsPage([createdEvent(6, { ledger: 11 })], { cursor: 'page-1' }))
      .mockResolvedValueOnce(eventsPage([], { cursor: 'page-2' }));

    const { streams } = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
      endLedger: 400,
    });

    expect(streams.map((stream) => stream.id)).toEqual(['6']);
    expect(rpc.getEvents).toHaveBeenCalledTimes(2);
  });

  it('ignores failed calls and events that are not stream creations', async () => {
    existing = [7n, 8n];
    rpc.getEvents.mockResolvedValueOnce(
      eventsPage(
        [
          createdEvent(7, { ledger: 11 }),
          createdEvent(8, { ledger: 12, inSuccessfulContractCall: false }),
          createdEvent(9, {
            ledger: 13,
            topic: [
              xdr.ScVal.scvSymbol('stream'),
              xdr.ScVal.scvSymbol('cancelled'),
              xdr.ScVal.scvU64(xdr.Uint64.fromString('9')),
            ],
          }),
        ],
        { cursor: 'page-1' },
      ),
    );
    rpc.getEvents.mockResolvedValueOnce(eventsPage([]));

    const { streams } = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
      endLedger: 20,
    });

    expect(streams.map((stream) => stream.id)).toEqual(['7']);
  });

  it('skips a stream whose record has been archived', async () => {
    existing = [10n];
    rpc.getEvents
      .mockResolvedValueOnce(
        eventsPage(
          [createdEvent(10, { ledger: 11 }), createdEvent(11, { ledger: 12, recipient: OTHER })],
          { cursor: 'page-1' },
        ),
      )
      .mockResolvedValueOnce(eventsPage([]));

    const { streams } = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
      endLedger: 20,
    });

    // Id 11 was created for the caller but its storage entry is gone.
    expect(streams.map((stream) => stream.id)).toEqual(['10']);
  });

  it('resumes from a cursor on two consecutive pages with no overlap or gap', async () => {
    existing = [1n, 2n];
    const cursorAfterFirst = eventId(10, 1);
    rpc.getEvents
      // First call: the page in the requested window, then a page past its end.
      .mockResolvedValueOnce(
        eventsPage([createdEvent(1, { ledger: 10, id: cursorAfterFirst })], {
          cursor: cursorAfterFirst,
        }),
      )
      .mockResolvedValueOnce(
        eventsPage([createdEvent(2, { ledger: 11, id: eventId(11, 1) })], {
          cursor: eventId(11, 1),
        }),
      )
      // Second call resumes exactly after ledger 10's event and returns ledger 11.
      .mockResolvedValueOnce(
        eventsPage([createdEvent(2, { ledger: 11, id: eventId(11, 1) })], {
          cursor: eventId(11, 1),
        }),
      )
      .mockResolvedValueOnce(eventsPage([], { cursor: eventId(11, 1) }));

    const first = await makeClient().listStreams({
      address: PUBLIC_KEY,
      startLedger: 10,
      endLedger: 10,
      pageSize: 1,
    });
    expect(first.streams.map((stream) => stream.id)).toEqual(['1']);
    expect(first.cursor).toBe(cursorAfterFirst);

    const second = await makeClient().listStreams({
      address: PUBLIC_KEY,
      cursor: first.cursor,
      pageSize: 1,
    });
    expect(second.streams.map((stream) => stream.id)).toEqual(['2']);
    expect(second.cursor).toBe(eventId(11, 1));

    // The second scan opens with the cursor alone; RPC forbids a ledger range.
    const resume = rpc.getEvents.mock.calls[2]![0]!;
    expect(resume).toEqual({
      filters: expect.any(Array),
      cursor: first.cursor,
      limit: 1,
    });
    expect(resume.startLedger).toBeUndefined();
    expect(resume.endLedger).toBeUndefined();
  });

  it('rejects an invalid cursor with a typed error before touching the network', async () => {
    const client = makeClient();
    await expect(
      client.listStreams({ address: PUBLIC_KEY, cursor: 'not-a-cursor' }),
    ).rejects.toThrow(InvalidCursorError);
    await expect(
      client.listStreams({ address: PUBLIC_KEY, cursor: '10-1', startLedger: 10 }),
    ).rejects.toThrow('cannot be combined');
    expect(rpc.calls()).toBe(0);
  });

  it('rejects unusable arguments before touching the network', async () => {
    const client = makeClient();
    await expect(client.listStreams({ address: 'not-an-address' })).rejects.toThrow(
      'Invalid address',
    );
    await expect(client.listStreams({ address: CONTRACT_ID, pageSize: 0 })).rejects.toThrow(
      'pageSize must be at least 1',
    );
    await expect(client.listStreams({ address: PUBLIC_KEY, maxLedgers: 0 })).rejects.toThrow(
      'maxLedgers must be a positive integer',
    );
    await expect(
      client.listStreams({ address: PUBLIC_KEY, startLedger: 20, endLedger: 10 }),
    ).rejects.toThrow('precedes');
    expect(rpc.calls()).toBe(0);
  });
});
