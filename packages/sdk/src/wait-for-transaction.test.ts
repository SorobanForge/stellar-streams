import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError, waitForTransaction } from './index.js';
import {
  NETWORK_PASSPHRASE,
  contractErrorEvent,
  fakeTransport,
  trappedResult,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

describe('waitForTransaction', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the hash when the transaction SUCCESS', async () => {
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));

    const result = await waitForTransaction({
      hash: 'abc123',
      transport: rpc,
      pollIntervalMs: 1,
      pollTimeoutMs: 200,
    });
    expect(result).toEqual({ hash: 'abc123' });
  });

  it('rejects with StreamsError on FAILED', async () => {
    rpc.getTransaction.mockResolvedValue(
      txResponse(GetTransactionStatus.FAILED, {
        resultXdr: trappedResult(),
        diagnosticEventsXdr: [contractErrorEvent(5, 'nothing to withdraw')],
      }),
    );

    const err = await waitForTransaction({
      hash: 'abc123',
      transport: rpc,
      pollIntervalMs: 1,
      pollTimeoutMs: 200,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StreamsError);
    expect((err as StreamsError).message).toMatch(/Transaction abc123 failed/);
  });

  it('polls through NOT_FOUND then resolves on SUCCESS', async () => {
    rpc.getTransaction
      .mockResolvedValueOnce(txResponse(GetTransactionStatus.NOT_FOUND))
      .mockResolvedValueOnce(txResponse(GetTransactionStatus.NOT_FOUND))
      .mockResolvedValueOnce(txResponse(GetTransactionStatus.SUCCESS));

    const result = await waitForTransaction({
      hash: 'abc123',
      transport: rpc,
      pollIntervalMs: 1,
      pollTimeoutMs: 200,
    });
    expect(result).toEqual({ hash: 'abc123' });
    expect(rpc.getTransaction).toHaveBeenCalledTimes(3);
  });

  it('rejects with a timeout error when the timeout is exhausted', async () => {
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.NOT_FOUND));

    await expect(
      waitForTransaction({
        hash: 'abc123',
        transport: rpc,
        pollIntervalMs: 5,
        pollTimeoutMs: 20,
      }),
    ).rejects.toThrow(/Timed out waiting for transaction abc123/);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.NOT_FOUND));

    await expect(
      waitForTransaction({
        hash: 'abc123',
        transport: rpc,
        signal: controller.signal,
        pollIntervalMs: 1,
        pollTimeoutMs: 200,
      }),
    ).rejects.toThrow(/aborted/i);
    expect(rpc.getTransaction).not.toHaveBeenCalled();
  });

  it('constructs a SorobanRpc.Server from rpcUrl when no transport is provided', async () => {
    const spy = vi
      .spyOn(SorobanRpc.Server.prototype, 'getTransaction')
      .mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));

    const result = await waitForTransaction({
      hash: 'abc123',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: NETWORK_PASSPHRASE,
      pollIntervalMs: 1,
      pollTimeoutMs: 200,
    });
    expect(result).toEqual({ hash: 'abc123' });
    spy.mockRestore();
  });

  it('throws when neither transport nor rpcUrl is given', async () => {
    await expect(
      waitForTransaction({ hash: 'abc123', pollIntervalMs: 1, pollTimeoutMs: 200 }),
    ).rejects.toThrow(/transport.*rpcUrl/i);
  });
});
