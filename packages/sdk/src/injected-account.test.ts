import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  PUBLIC_KEY,
  fakeTransport,
  makeClient,
  sendResponse,
  simulateByMethod,
  streamScVal,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

describe('injected account (#330)', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal(),
        claimable: nativeToScVal(42n, { type: 'i128' }),
        withdraw: xdr.ScVal.scvVoid(),
      }),
    );
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the injected account without calling getAccount', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    await client.claimable(1);
    expect(rpc.getAccount).not.toHaveBeenCalled();
  });

  it('injected account is used exactly once for concurrent reads', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    // Fire two reads concurrently — both should share the same cached account.
    await Promise.all([client.claimable(1), client.getStream(1)]);
    expect(rpc.getAccount).not.toHaveBeenCalled();
  });

  it('forces a refetch after invalidateAccount even if account was injected', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    await client.claimable(1);
    client.invalidateAccount();
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(1);
  });

  it('forces a refetch after a write (normal cache-invalidation behaviour)', async () => {
    const injected = new Account(PUBLIC_KEY, '500');
    const client = makeClient({ transport: rpc, account: injected });

    // Trigger a write; invalidation should clear the injected cache too.
    await client.withdraw(1);
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(1);
  });
});

const { GetTransactionStatus } = SorobanRpc.Api;

describe('injected account (#330)', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal(),
        claimable: nativeToScVal(42n, { type: 'i128' }),
        withdraw: require('@stellar/stellar-sdk').xdr.ScVal.scvVoid(),
      }),
    );
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the injected account without calling getAccount', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    await client.claimable(1);
    expect(rpc.getAccount).not.toHaveBeenCalled();
  });

  it('injected account is used exactly once for concurrent reads', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    // Fire two reads concurrently — both should share the same cached account.
    await Promise.all([client.claimable(1), client.getStream(1)]);
    expect(rpc.getAccount).not.toHaveBeenCalled();
  });

  it('forces a refetch after invalidateAccount even if account was injected', async () => {
    const injected = new Account(PUBLIC_KEY, '999');
    const client = makeClient({ transport: rpc, account: injected });

    await client.claimable(1);
    client.invalidateAccount();
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(1);
  });

  it('forces a refetch after a write (normal cache-invalidation behaviour)', async () => {
    const injected = new Account(PUBLIC_KEY, '500');
    const client = makeClient({ transport: rpc, account: injected });

    // Trigger a write; invalidation should clear the injected cache too.
    await client.withdraw(1);
    await client.claimable(1);

    expect(rpc.getAccount).toHaveBeenCalledTimes(1);
  });
});
