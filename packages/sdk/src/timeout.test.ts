import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Account, nativeToScVal } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  FailoverTransport,
  RpcTimeoutError,
  TimeoutTransport,
} from './index.js';
import { PUBLIC_KEY, fakeTransport, makeClient, simulationSuccess } from './test-helpers';

const PRIMARY = 'https://primary.example';
const SECONDARY = 'https://secondary.example';

/** A promise that never settles: the shape of a request to a hung RPC host. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

describe('RPC request timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('documents a 30 second default', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it('rejects a hung injected transport with an RpcTimeoutError', async () => {
    const transport = fakeTransport();
    transport.simulateTransaction.mockImplementation(() => never());
    const client = makeClient({ rpcUrl: PRIMARY, transport, requestTimeoutMs: 1_000 });

    const read = client.claimable(1);
    const assertion = expect(read).rejects.toBeInstanceOf(RpcTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    const error = await read.catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: 'TimeoutError',
      method: 'simulateTransaction',
      timeoutMs: 1_000,
      url: PRIMARY,
    });
    expect((error as Error).message).toBe(
      `Soroban RPC simulateTransaction timed out after 1000ms (${PRIMARY}).`,
    );
  });

  it('does not time out before the deadline', async () => {
    const transport = fakeTransport();
    transport.simulateTransaction.mockImplementation(() => never());
    const client = makeClient({ rpcUrl: PRIMARY, transport, requestTimeoutMs: 1_000 });

    let settled = false;
    const read = client.claimable(1).finally(() => {
      settled = true;
    });
    read.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it('applies the default timeout when requestTimeoutMs is not set', async () => {
    const transport = fakeTransport();
    transport.getAccount.mockImplementation(() => never());
    const client = makeClient({ rpcUrl: PRIMARY, transport });

    const read = client.claimable(1);
    const assertion = expect(read).rejects.toMatchObject({
      name: 'TimeoutError',
      method: 'getAccount',
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('times out the default SorobanRpc.Server transport too', async () => {
    vi.spyOn(SorobanRpc.Server.prototype, 'getAccount').mockImplementation(() => never());
    const client = makeClient({ rpcUrl: PRIMARY, requestTimeoutMs: 500 });

    const read = client.claimable(1);
    const assertion = expect(read).rejects.toMatchObject({
      name: 'TimeoutError',
      method: 'getAccount',
      url: PRIMARY,
    });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('counts a timeout as a transport failure and fails over', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const primary = fakeTransport();
    const secondary = fakeTransport();
    primary.getAccount.mockImplementation(() => never());
    secondary.getAccount.mockResolvedValue(new Account(PUBLIC_KEY, '100'));
    secondary.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal(7n, { type: 'i128' })),
    );
    const onRpcFailover = vi.fn();

    const client = makeClient({
      rpcUrl: undefined,
      rpcUrls: [PRIMARY, SECONDARY],
      transportFactory: (url) => (url === PRIMARY ? primary : secondary),
      requestTimeoutMs: 2_000,
      onRpcFailover,
    });

    const read = client.claimable(1);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(read).resolves.toBe(7n);
    expect(client.activeRpcUrl).toBe(SECONDARY);
    expect(onRpcFailover).toHaveBeenCalledWith(
      expect.objectContaining({
        from: PRIMARY,
        to: SECONDARY,
        error: expect.any(RpcTimeoutError),
      }),
    );
    expect(warn).toHaveBeenCalled();
  });

  it('fails over between an array of injected transports on a timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const primary = fakeTransport();
    const secondary = fakeTransport();
    primary.simulateTransaction.mockImplementation(() => never());
    secondary.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal(3n, { type: 'i128' })),
    );

    const client = makeClient({
      rpcUrls: [PRIMARY, SECONDARY],
      transport: [primary, secondary],
      requestTimeoutMs: 100,
    });

    const read = client.claimable(1);
    await vi.advanceTimersByTimeAsync(100);
    await expect(read).resolves.toBe(3n);
    expect(client.activeRpcUrl).toBe(SECONDARY);
  });

  it('can be disabled with requestTimeoutMs: 0', async () => {
    const transport = fakeTransport();
    transport.simulateTransaction.mockImplementation(() => never());
    const client = makeClient({ rpcUrl: PRIMARY, transport, requestTimeoutMs: 0 });

    let settled = false;
    void client.claimable(1).finally(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS * 10);
    expect(settled).toBe(false);
  });

  it('clears its timer once the request settles', async () => {
    const transport = fakeTransport();
    transport.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal(1n, { type: 'i128' })),
    );
    const client = makeClient({ rpcUrl: PRIMARY, transport, requestTimeoutMs: 1_000 });

    await expect(client.claimable(1)).resolves.toBe(1n);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes application errors through unchanged', async () => {
    const transport = fakeTransport();
    const wrapped = new TimeoutTransport(transport, 1_000, PRIMARY);
    transport.getTransaction.mockRejectedValueOnce(new Error('boom'));

    await expect(wrapped.getTransaction('abc')).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wraps every transport method', async () => {
    const transport = fakeTransport();
    const wrapped = new TimeoutTransport(transport, 50);
    const methods = [
      'getAccount',
      'simulateTransaction',
      'prepareTransaction',
      'sendTransaction',
      'getTransaction',
      'getLatestLedger',
      'getEvents',
    ] as const;

    for (const method of methods) {
      // Each method has its own signature; a never-settling stub fits them all.
      (transport[method] as unknown as Mock<() => Promise<never>>).mockImplementation(never);
      const call = (wrapped[method] as (arg?: unknown) => Promise<unknown>).call(wrapped, {});
      const assertion = expect(call).rejects.toMatchObject({ method, timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    }
  });

  it('can be composed into a hand-built FailoverTransport', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const primary = fakeTransport();
    const secondary = fakeTransport();
    primary.getLatestLedger.mockImplementation(() => never());

    const failover = new FailoverTransport([
      { url: PRIMARY, transport: new TimeoutTransport(primary, 10, PRIMARY) },
      { url: SECONDARY, transport: new TimeoutTransport(secondary, 10, SECONDARY) },
    ]);

    const tip = failover.getLatestLedger();
    await vi.advanceTimersByTimeAsync(10);
    await expect(tip).resolves.toMatchObject({ sequence: expect.any(Number) });
    expect(failover.activeUrl).toBe(SECONDARY);
  });
});
