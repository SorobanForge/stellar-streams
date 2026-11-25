import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Account,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { TEST_CLIENT_DEFAULTS, createTestClient } from './client';
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  PUBLIC_KEY,
  RECIPIENT,
  escrowFixture,
  splitFixture,
  streamFixture,
  streamScVal,
} from './fixtures';
import { createFakeTransport } from './transport';

function nextStreamIdTx() {
  return new TransactionBuilder(new Account(PUBLIC_KEY, '1'), {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call('next_stream_id'))
    .setTimeout(30)
    .build();
}

const server = () => new SorobanRpc.Server('https://rpc.invalid');

describe('createFakeTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers getAccount in memory with the configured sequence', async () => {
    const transport = createFakeTransport({ accountSequence: '42' });

    const account = await server().getAccount(PUBLIC_KEY);
    expect(account.accountId()).toBe(PUBLIC_KEY);
    expect(account.sequenceNumber()).toBe('42');
    expect(transport.calls()).toBe(1);

    transport.reset();
    expect(transport.calls()).toBe(0);
  });

  it('simulates a call by its contract method name', async () => {
    const transport = createFakeTransport();
    transport.respondWith({ next_stream_id: nativeToScVal(7n, { type: 'u64' }) });

    const response = await server().simulateTransaction(nextStreamIdTx());
    if (SorobanRpc.Api.isSimulationError(response)) throw new Error('unexpected failure');

    expect(scValToNative(response.result!.retval)).toBe(7n);
  });

  it('reports an unregistered method instead of guessing a result', async () => {
    createFakeTransport().respondWith({});

    await expect(server().simulateTransaction(nextStreamIdTx())).rejects.toThrow(
      'Unexpected simulation of next_stream_id',
    );
  });

  it('submits, then confirms with the configured status and hash', async () => {
    createFakeTransport({
      hash: 'deadbeef',
      sendStatus: 'PENDING',
      transactionStatus: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
    });

    await expect(server().sendTransaction(nextStreamIdTx())).resolves.toMatchObject({
      status: 'PENDING',
      hash: 'deadbeef',
    });
    await expect(server().getTransaction('deadbeef')).resolves.toMatchObject({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
    });
  });

  it('restores the real RPC methods', () => {
    const transport = createFakeTransport();
    expect(vi.isMockFunction(SorobanRpc.Server.prototype.getAccount)).toBe(true);

    transport.restore();
    expect(vi.isMockFunction(SorobanRpc.Server.prototype.getAccount)).toBe(false);
  });
});

describe('createTestClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a client with test-safe defaults and shares one transport', () => {
    const { client, transport, withClient } = createTestClient((config) => ({ config }));

    expect(client.config).toEqual(TEST_CLIENT_DEFAULTS);
    expect(withClient().config).toEqual(TEST_CLIENT_DEFAULTS);
    expect(withClient({ pollIntervalMs: 5 }).config).toEqual({
      ...TEST_CLIENT_DEFAULTS,
      pollIntervalMs: 5,
    });

    transport.restore();
    expect(vi.isMockFunction(SorobanRpc.Server.prototype.simulateTransaction)).toBe(false);
  });

  it('applies create-level overrides to every client it builds', () => {
    const { client, withClient } = createTestClient((config) => config, { pollTimeoutMs: 10 });

    expect(client.pollTimeoutMs).toBe(10);
    expect(withClient({ skipSimulation: true }).skipSimulation).toBe(true);
  });
});

describe('fixtures', () => {
  it('builds stream, escrow, and split values with overrides', () => {
    expect(streamFixture({ id: '7', cancelled: true })).toMatchObject({
      id: '7',
      cancelled: true,
      totalAmount: '1000000000',
      sender: PUBLIC_KEY,
    });
    expect(escrowFixture({ status: 'released' })).toMatchObject({
      status: 'released',
      payee: RECIPIENT,
      amount: '1000000000',
    });
    expect(splitFixture({ shares: [100] })).toMatchObject({ shares: [100], totalShares: 100 });
  });

  it('encodes a stream struct the way get_stream returns it', () => {
    const decoded = scValToNative(streamScVal({ label: 'Q4 payroll', total_amount: 2_500_000n }));

    expect(decoded).toMatchObject({
      label: 'Q4 payroll',
      total_amount: 2_500_000n,
      recipient: RECIPIENT,
      cancelled: false,
    });
  });
});
