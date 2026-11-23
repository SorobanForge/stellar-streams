import { describe, expect, it, vi } from 'vitest';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError } from './index.js';
import {
  CONTRACT_ID,
  fakeTransport,
  invokedArgs,
  invokedCall,
  makeClient,
  sendResponse,
  simulationError,
  simulationSuccess,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** A transport where a write simulates, submits, and confirms successfully. */
function writableTransport() {
  const rpc = fakeTransport();
  rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
  rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
  rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  return rpc;
}

describe('topUp', () => {
  it("invokes the contract's top_up method with the id as u64 and amount as i128", async () => {
    const rpc = writableTransport();

    const result = await makeClient({ transport: rpc }).topUp(9_007_199_254_740_993n, '25000000');

    expect(result).toEqual({ hash: 'abc123' });
    const simulated = rpc.simulateTransaction.mock.calls[0]![0];
    expect(invokedCall(simulated)).toEqual({ contractId: CONTRACT_ID, method: 'top_up' });
    const args = invokedArgs(simulated);
    expect(args).toHaveLength(2);
    expect(scValToNative(args[0]!)).toBe(9_007_199_254_740_993n);
    expect(scValToNative(args[1]!)).toBe(25_000_000n);
  });

  it('accepts the amount as a number or bigint', async () => {
    const rpc = writableTransport();
    const client = makeClient({ transport: rpc });

    await client.topUp(1, 7);
    await client.topUp(2, 8n);

    const amounts = rpc.sendTransaction.mock.calls.map(([tx]) =>
      scValToNative(invokedArgs(tx)[1]!),
    );
    expect(amounts).toEqual([7n, 8n]);
  });

  it.each([
    ['0', 'zero'],
    ['-1', 'negative'],
    ['1.5', 'fractional'],
    ['not-a-number', 'non-numeric'],
  ])('rejects %s (%s) before any RPC call', async (amount) => {
    const rpc = writableTransport();

    const error = await makeClient({ transport: rpc })
      .topUp(1, amount)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Invalid amount');
    expect(rpc.calls()).toBe(0);
  });

  it.each([
    [18, 'STREAM_COMPLETED'],
    [19, 'AMOUNT_OVERFLOW'],
  ] as const)('maps contract error #%i onto StreamsError.code %s', async (contractCode, code) => {
    const rpc = writableTransport();
    rpc.simulateTransaction.mockResolvedValue(
      simulationError(`HostError: Error(Contract, #${contractCode})`),
    );

    const error = await makeClient({ transport: rpc })
      .topUp(1, 100)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StreamsError);
    expect((error as StreamsError).code).toBe(code);
    expect((error as StreamsError).contractCode).toBe(contractCode);
    expect((error as StreamsError).message).toContain(`Simulation of top_up failed`);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('forwards an abort signal and skips the wallet prompt when already aborted', async () => {
    const rpc = writableTransport();
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);
    const controller = new AbortController();
    controller.abort();

    const error = await makeClient({ transport: rpc, signTransaction })
      .topUp(1, 100, { signal: controller.signal })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('AbortError');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.calls()).toBe(0);
  });
});
