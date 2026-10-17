import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError } from './index';
import {
  CONTRACT_ID,
  contractErrorEvent,
  invokedCall,
  makeClient,
  mockRpc,
  sendResponse,
  simulationError,
  simulationSuccess,
  trappedResult,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

describe('contract error mapping', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names a known contract error code from a simulation failure', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationError('HostError: Error(Contract, #5) contract call failed'),
    );

    const error = (await makeClient()
      .claimable(1)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBe('NOTHING_TO_WITHDRAW');
    expect(error.contractCode).toBe(5);
    expect(error.message).toBe(
      'Simulation of claimable failed: NOTHING_TO_WITHDRAW (contract error #5) — HostError: Error(Contract, #5) contract call failed',
    );
  });

  it('keeps the raw message for a contract code that is not mapped', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #99)'));

    const error = (await makeClient()
      .claimable(1)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBeUndefined();
    expect(error.contractCode).toBe(99);
    expect(error.message).toBe('Simulation of claimable failed: HostError: Error(Contract, #99)');
  });

  it('keeps the raw message when the failure is not a contract error', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationError('HostError: Error(Budget, ExceededLimit)'),
    );

    const error = (await makeClient()
      .claimable(1)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBeUndefined();
    expect(error.contractCode).toBeUndefined();
    expect(error.message).toBe(
      'Simulation of claimable failed: HostError: Error(Budget, ExceededLimit)',
    );
  });

  it('maps a rejected submission through the contract code in its diagnostics', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(
      sendResponse('ERROR', {
        errorResult: trappedResult(),
        diagnosticEvents: [contractErrorEvent(4, 'stream not found')],
      }),
    );

    const error = (await makeClient()
      .withdraw(1)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBe('STREAM_NOT_FOUND');
    expect(error.contractCode).toBe(4);
    expect(error.message).toBe(
      'Transaction abc123 was rejected: txFailed (invokeHostFunctionTrapped) — diagnostics: Error(Contract, #4) stream not found',
    );
  });

  it('leaves a rejected submission without diagnostics untyped', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('ERROR', { errorResult: trappedResult() }));

    const error = (await makeClient()
      .withdraw(1)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBeUndefined();
    expect(error.message).toBe(
      'Transaction abc123 was rejected: txFailed (invokeHostFunctionTrapped)',
    );
  });
});

describe('write simulation pre-flight', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts with a readable error before preparing or signing when simulation fails', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #3)'));
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);

    const error = (await makeClient({ signTransaction })
      .cancel(7)
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBe('INVALID_CLIFF');
    expect(error.message).toBe(
      'Simulation of cancel failed: INVALID_CLIFF (contract error #3) — HostError: Error(Contract, #3)',
    );
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('simulates the assembled transaction and proceeds when it passes', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));

    await expect(makeClient().withdraw(1)).resolves.toEqual({ hash: 'abc123' });
    expect(invokedCall(rpc.simulateTransaction.mock.calls[0]![0])).toEqual({
      contractId: CONTRACT_ID,
      method: 'withdraw',
    });
    expect(rpc.prepareTransaction).toHaveBeenCalledTimes(1);
  });

  it('skipSimulation bypasses the pre-flight check', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #5)'));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));

    await expect(makeClient({ skipSimulation: true }).withdraw(1)).resolves.toEqual({
      hash: 'abc123',
    });
    expect(rpc.simulateTransaction).not.toHaveBeenCalled();
  });
});
