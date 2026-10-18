import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  PUBLIC_KEY,
  badSequenceResult,
  createTestClient,
  sendResponse,
  simulateByMethod,
  streamScVal,
  txResponse,
  type FakeTransport,
  type TestClientHarness,
} from '@stellar-starter-kit/testing';
import { StreamsClient, type StreamsClientOptions } from './index';

let harness: TestClientHarness<StreamsClient>;
let rpc: FakeTransport;

const makeClient = (overrides: Partial<StreamsClientOptions> = {}) =>
  harness.withClient(overrides);

const { GetTransactionStatus } = SorobanRpc.Api;

/** The dashboard's read pattern: `useStream` loads a stream and its claimable balance. */
async function dashboardLoad(client: ReturnType<typeof makeClient>) {
  await Promise.all([client.getStream(1), client.claimable(1)]);
}

describe('RPC transport calls for the dashboard read pattern', () => {
  beforeEach(() => {
    harness = createTestClient((config) => new StreamsClient(config));
    rpc = harness.transport;
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal(),
        claimable: nativeToScVal(42n, { type: 'i128' }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records transport calls for an initial load and a poll refresh', async () => {
    const client = makeClient();

    await dashboardLoad(client);
    const initial = { getAccount: rpc.getAccount.mock.calls.length, total: rpc.calls() };
    rpc.reset();

    await dashboardLoad(client);
    const refresh = { getAccount: rpc.getAccount.mock.calls.length, total: rpc.calls() };

    // Before caching: initial = { getAccount: 2, total: 4 }, refresh = { getAccount: 2, total: 4 }.
    expect(initial).toEqual({ getAccount: 1, total: 3 });
    expect(refresh).toEqual({ getAccount: 0, total: 2 });
  });
});

describe('source account cache', () => {
  beforeEach(() => {
    harness = createTestClient((config) => new StreamsClient(config));
    rpc = harness.transport;
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal(),
        claimable: nativeToScVal(42n, { type: 'i128' }),
        // Writes are simulated before being prepared; void is a valid result.
        withdraw: xdr.ScVal.scvVoid(),
      }),
    );
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not advance the cached sequence number on simulation', async () => {
    const client = makeClient();
    await client.claimable(1);
    await client.claimable(1);
    await client.withdraw(1);

    const sequences = rpc.prepareTransaction.mock.calls.map(
      ([tx]) => (tx as { sequence: string }).sequence,
    );
    // getAccount returns sequence 100; the first write must use 101.
    expect(sequences).toEqual(['101']);
  });

  it('re-fetches the account after a successful write', async () => {
    const client = makeClient();
    await client.claimable(1);
    await client.withdraw(1);
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
  });

  it('re-fetches once and retries when the sequence number is stale', async () => {
    rpc.getAccount
      .mockResolvedValueOnce(new Account(PUBLIC_KEY, '100'))
      .mockResolvedValueOnce(new Account(PUBLIC_KEY, '105'));
    rpc.sendTransaction
      .mockResolvedValueOnce(sendResponse('ERROR', { errorResult: badSequenceResult() }))
      .mockResolvedValueOnce(sendResponse('PENDING'));
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);

    await expect(makeClient({ signTransaction }).withdraw(1)).resolves.toEqual({
      hash: 'abc123',
    });
    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
    expect(signTransaction).toHaveBeenCalledTimes(2);
    const sequences = rpc.prepareTransaction.mock.calls.map(
      ([tx]) => (tx as { sequence: string }).sequence,
    );
    expect(sequences).toEqual(['101', '106']);
  });

  it('only retries a stale sequence once', async () => {
    rpc.sendTransaction.mockResolvedValue(
      sendResponse('ERROR', { errorResult: badSequenceResult() }),
    );

    await expect(makeClient().withdraw(1)).rejects.toThrow(/stale sequence number/);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed account fetch', async () => {
    rpc.getAccount.mockRejectedValueOnce(new Error('network down'));
    const client = makeClient();

    await expect(client.claimable(1)).rejects.toThrow('network down');
    await expect(client.claimable(1)).resolves.toBe(42n);
    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after invalidateAccount()', async () => {
    const client = makeClient();
    await client.claimable(1);
    client.invalidateAccount();
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
  });
});
