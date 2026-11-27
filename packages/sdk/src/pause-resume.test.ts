import { describe, expect, it, vi } from 'vitest';
import {
  MemoText,
  SorobanDataBuilder,
  Transaction,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError, type SimulationResult } from './index.js';
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

describe.each(['pause', 'resume'] as const)('%s', (method) => {
  it(`invokes the contract's ${method} method with the id as a u64`, async () => {
    const rpc = writableTransport();

    const result = await makeClient({ transport: rpc })[method](9_007_199_254_740_993n);

    expect(result).toEqual({ hash: 'abc123' });
    const simulated = rpc.simulateTransaction.mock.calls[0]![0];
    expect(invokedCall(simulated)).toEqual({ contractId: CONTRACT_ID, method });
    const args = invokedArgs(simulated);
    expect(args).toHaveLength(1);
    expect(args[0]!.switch().name).toBe('scvU64');
    expect(scValToNative(args[0]!)).toBe(9_007_199_254_740_993n);

    // The submitted transaction carries the same call.
    const sent = rpc.sendTransaction.mock.calls[0]![0];
    expect(invokedCall(sent)).toEqual({ contractId: CONTRACT_ID, method });
    expect(scValToNative(invokedArgs(sent)[0]!)).toBe(9_007_199_254_740_993n);
  });

  it('accepts the id as a number or decimal string', async () => {
    const rpc = writableTransport();
    const client = makeClient({ transport: rpc });

    await client[method](7);
    await client[method]('8');

    const ids = rpc.sendTransaction.mock.calls.map(([tx]) => scValToNative(invokedArgs(tx)[0]!));
    expect(ids).toEqual([7n, 8n]);
  });

  it('forwards the fee and memo write options', async () => {
    const rpc = writableTransport();

    await makeClient({ transport: rpc })[method](1, {
      fee: '2500000',
      memo: { type: 'text', value: `${method}-1` },
    });

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe('2500000');
    expect(tx.memo.type).toBe(MemoText);
    expect(tx.memo.value!.toString()).toBe(`${method}-1`);
  });

  it('simulateOnly returns the assembled transaction without signing or submitting', async () => {
    const rpc = writableTransport();
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvVoid(), {
        minResourceFee: '1234',
        transactionData: new SorobanDataBuilder().setResources(1_000, 200, 300),
        result: { auth: [], retval: xdr.ScVal.scvVoid() },
      }),
    );
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);

    const result: SimulationResult = await makeClient({ transport: rpc, signTransaction })[method](
      1,
      { simulateOnly: true },
    );

    expect(result.transaction).toBeInstanceOf(Transaction);
    expect(result.minResourceFee).toBe('1234');
    expect(invokedCall(result.transaction)).toEqual({ contractId: CONTRACT_ID, method });
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('honours an aborted signal before any RPC call or wallet prompt', async () => {
    const rpc = writableTransport();
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);
    const controller = new AbortController();
    controller.abort();

    const error = (await makeClient({ transport: rpc, signTransaction })
      [method](1, { signal: controller.signal })
      .catch((e: unknown) => e)) as Error;

    expect(error.name).toBe('AbortError');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.calls()).toBe(0);
  });

  it.each([
    [4, 'STREAM_NOT_FOUND'],
    [8, 'ALREADY_CANCELLED'],
    [16, 'STREAM_PAUSED'],
    [17, 'NOT_PAUSED'],
  ] as const)('maps contract error #%i onto StreamsError.code %s', async (contractCode, code) => {
    const rpc = writableTransport();
    rpc.simulateTransaction.mockResolvedValue(
      simulationError(`HostError: Error(Contract, #${contractCode})`),
    );

    const error = await makeClient({ transport: rpc })
      [method](1)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StreamsError);
    expect((error as StreamsError).code).toBe(code);
    expect((error as StreamsError).contractCode).toBe(contractCode);
    expect((error as StreamsError).message).toContain(`Simulation of ${method} failed`);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });
});
