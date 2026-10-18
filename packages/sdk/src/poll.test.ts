import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  NETWORK_PASSPHRASE,
  PUBLIC_KEY,
  contractErrorEvent,
  fakeTransport,
  makeClient,
  sendResponse,
  simulationSuccess,
  trappedResult,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

describe('transaction submission and polling', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    // Writes simulate before being prepared; these tests only exercise what
    // happens after a simulation succeeds.
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves once the transaction succeeds', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction
      .mockResolvedValueOnce(txResponse(GetTransactionStatus.NOT_FOUND))
      .mockResolvedValueOnce(txResponse(GetTransactionStatus.SUCCESS));

    await expect(makeClient({ transport: rpc }).withdraw(1)).resolves.toEqual({ hash: 'abc123' });
    expect(rpc.getTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries a queued (TRY_AGAIN_LATER) submission with backoff, then succeeds', async () => {
    rpc.sendTransaction
      .mockResolvedValueOnce(sendResponse('TRY_AGAIN_LATER'))
      .mockResolvedValueOnce(sendResponse('TRY_AGAIN_LATER'))
      .mockResolvedValueOnce(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await expect(makeClient({ pollIntervalMs: 5, transport: rpc }).withdraw(1)).resolves.toEqual({
      hash: 'abc123',
    });
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(3);
    const delays = setTimeoutSpy.mock.calls.map(([, ms]) => ms);
    expect(delays).toEqual([5, 10]);
  });

  it('treats DUPLICATE as in flight and polls it', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('DUPLICATE'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));

    await expect(makeClient({ transport: rpc }).withdraw(1)).resolves.toEqual({ hash: 'abc123' });
  });

  it('signs the prepared transaction and submits the signed envelope', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
    const signTransaction = vi.fn(
      async (txXdr: string, _opts: { networkPassphrase: string; address: string }) => txXdr,
    );

    await expect(makeClient({ signTransaction, transport: rpc }).withdraw(1)).resolves.toEqual({
      hash: 'abc123',
    });

    const [preparedTx] = rpc.prepareTransaction.mock.calls[0]!;
    expect(signTransaction).toHaveBeenCalledTimes(1);
    const [signedXdr, signerOptions] = signTransaction.mock.calls[0]!;
    expect(signedXdr).toBe(preparedTx.toXDR());
    expect(signerOptions).toEqual({
      networkPassphrase: NETWORK_PASSPHRASE,
      address: PUBLIC_KEY,
    });
    const [submitted] = rpc.sendTransaction.mock.calls[0]!;
    expect(submitted.toXDR()).toBe(signedXdr);
  });

  it('gives up on TRY_AGAIN_LATER once the timeout is exhausted', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('TRY_AGAIN_LATER'));

    await expect(
      makeClient({ pollIntervalMs: 5, pollTimeoutMs: 30, transport: rpc }).withdraw(1),
    ).rejects.toThrow(/TRY_AGAIN_LATER for transaction abc123 after \d+\.\ds/);
  });

  it('includes the result code and diagnostics when the transaction FAILED', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(
      txResponse(GetTransactionStatus.FAILED, {
        resultXdr: trappedResult(),
        diagnosticEventsXdr: [contractErrorEvent(4, 'nothing to withdraw')],
      }),
    );

    const error = await makeClient({ transport: rpc })
      .withdraw(1)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Transaction abc123 failed: txFailed (invokeHostFunctionTrapped) — diagnostics: Error(Contract, #4) nothing to withdraw',
    );
  });

  it('reports a FAILED transaction without diagnostics', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(
      txResponse(GetTransactionStatus.FAILED, { resultXdr: trappedResult() }),
    );

    await expect(makeClient({ transport: rpc }).withdraw(1)).rejects.toThrow(
      'Transaction abc123 failed: txFailed (invokeHostFunctionTrapped)',
    );
  });

  it('reports a rejected (ERROR) submission with its result code', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('ERROR', { errorResult: trappedResult() }));

    await expect(makeClient({ transport: rpc }).withdraw(1)).rejects.toThrow(
      'Transaction abc123 was rejected: txFailed (invokeHostFunctionTrapped)',
    );
    expect(rpc.getTransaction).not.toHaveBeenCalled();
  });

  it('times out with the hash and elapsed time', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.NOT_FOUND));

    await expect(
      makeClient({ pollIntervalMs: 5, pollTimeoutMs: 40, transport: rpc }).withdraw(1),
    ).rejects.toThrow(/^Timed out waiting for transaction abc123 after \d+\.\ds/);
  });
});
