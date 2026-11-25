import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { StreamsError } from './index.js';
import {
  PUBLIC_KEY,
  fakeTransport,
  makeClient,
  simulationError,
  simulationSuccess,
  streamScVal,
} from './test-helpers';

const PRIMARY = 'https://primary.example';
const SECONDARY = 'https://secondary.example';

/** A fetch/axios-style connection failure. */
function connectionRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
    code: 'ECONNREFUSED',
  });
}

/** A timeout reported the way axios and fetch wrappers usually report it. */
function timeout(): Error {
  return Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
}

/** An HTTP response error, as axios attaches to `error.response`. */
function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

describe('RPC endpoint failover', () => {
  let primary: ReturnType<typeof fakeTransport>;
  let secondary: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    primary = fakeTransport();
    secondary = fakeTransport();
    secondary.getAccount.mockResolvedValue(new Account(PUBLIC_KEY, '100'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeFailoverClient(onRpcFailover = vi.fn()) {
    return makeClient({
      rpcUrl: undefined,
      rpcUrls: [PRIMARY, SECONDARY],
      transportFactory: (url) => (url === PRIMARY ? primary : secondary),
      onRpcFailover,
    });
  }

  it('rotates to the next host on a network error and stays there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    primary.getAccount.mockRejectedValueOnce(connectionRefused());
    secondary.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal(1n, { type: 'i128' })),
    );
    const onRpcFailover = vi.fn();

    const client = makeFailoverClient(onRpcFailover);
    const claimable = await client.claimable(1);

    expect(claimable).toBe(1n);
    expect(client.activeRpcUrl).toBe(SECONDARY);
    expect(client.rpcUrls).toEqual([PRIMARY, SECONDARY]);
    expect(onRpcFailover).toHaveBeenCalledWith(
      expect.objectContaining({ from: PRIMARY, to: SECONDARY }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`RPC ${PRIMARY} failed; failing over to ${SECONDARY}`),
      expect.any(Error),
    );

    // The second read goes straight to the sticky host.
    primary.getAccount.mockClear();
    primary.simulateTransaction.mockClear();
    await client.claimable(2);
    expect(primary.getAccount).not.toHaveBeenCalled();
    expect(primary.simulateTransaction).not.toHaveBeenCalled();
    expect(secondary.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a 5xx response', () => httpError(503)],
    ['a timeout', timeout],
  ])('rotates on %s', async (_label, makeError) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    primary.getAccount.mockRejectedValueOnce(makeError());
    secondary.simulateTransaction.mockResolvedValue(simulationSuccess(streamScVal()));

    const client = makeFailoverClient();
    await expect(client.getStream(1)).resolves.toEqual(expect.objectContaining({ id: '1' }));
    expect(client.activeRpcUrl).toBe(SECONDARY);
  });

  it('does not fail over on an application-level simulation error', async () => {
    const onRpcFailover = vi.fn();
    primary.simulateTransaction.mockResolvedValue(
      simulationError('Simulation failed: Error(Contract, #4)'),
    );

    const client = makeFailoverClient(onRpcFailover);

    await expect(client.getStream(1)).rejects.toBeInstanceOf(StreamsError);
    expect(client.activeRpcUrl).toBe(PRIMARY);
    expect(secondary.getAccount).not.toHaveBeenCalled();
    expect(onRpcFailover).not.toHaveBeenCalled();
  });

  it('does not fail over on a 4xx response', async () => {
    primary.getAccount.mockRejectedValueOnce(httpError(400));

    const client = makeFailoverClient();

    await expect(client.getStream(1)).rejects.toThrow('status code 400');
    expect(client.activeRpcUrl).toBe(PRIMARY);
    expect(secondary.getAccount).not.toHaveBeenCalled();
  });

  it('rethrows the last error when every host is down', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    primary.getAccount.mockRejectedValueOnce(connectionRefused());
    secondary.getAccount.mockRejectedValueOnce(connectionRefused());

    const client = makeFailoverClient();

    await expect(client.getStream(1)).rejects.toThrow('ECONNREFUSED');
    expect(primary.getAccount).toHaveBeenCalledTimes(1);
    expect(secondary.getAccount).toHaveBeenCalledTimes(1);
  });

  it('fails over between an array of injected transports', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    primary.getAccount.mockRejectedValueOnce(connectionRefused());
    secondary.simulateTransaction.mockResolvedValue(simulationSuccess(streamScVal()));

    const client = makeClient({
      rpcUrls: [PRIMARY, SECONDARY],
      transport: [primary, secondary],
    });

    await expect(client.getStream(1)).resolves.toEqual(expect.objectContaining({ id: '1' }));
    expect(client.rpcUrls).toEqual([PRIMARY, SECONDARY]);
    expect(client.activeRpcUrl).toBe(SECONDARY);
  });

  it('keeps the single-endpoint path unchanged', async () => {
    const client = makeClient({
      rpcUrl: PRIMARY,
      transport: primary,
      signTransaction: async (xdr) => xdr,
    });
    primary.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvVoid(), { result: { auth: [], retval: xdr.ScVal.scvVoid() } }),
    );

    expect(client.activeRpcUrl).toBe(PRIMARY);
    expect(client.rpcUrls).toEqual([PRIMARY]);
  });
});
