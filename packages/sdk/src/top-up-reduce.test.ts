import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SorobanDataBuilder, scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError, type StreamErrorCode } from './index';
import {
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

/** The id and amount arguments of the contract call the client prepared. */
function preparedArgs(rpc: ReturnType<typeof fakeTransport>, method: string) {
  const [tx] = rpc.prepareTransaction.mock.calls[0]!;
  expect(invokedCall(tx).method).toBe(method);
  const args = invokedArgs(tx);
  return { id: scValToNative(args[0]!) as bigint, amount: scValToNative(args[1]!) as bigint, args };
}

describe('topUp and reduceStream', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('invokes top_up with a u64 id and an i128 amount', async () => {
    const { hash } = await makeClient({ transport: rpc }).topUp(7n, '1000000000');

    expect(hash).toBe('abc123');
    const { id, amount, args } = preparedArgs(rpc, 'top_up');
    expect(id).toBe(7n);
    expect(amount).toBe(1_000_000_000n);
    expect(args[0]!.switch()).toBe(xdr.ScValType.scvU64());
    expect(args[1]!.switch()).toBe(xdr.ScValType.scvI128());
  });

  it('invokes reduce_stream with a u64 id and an i128 new total', async () => {
    const { hash } = await makeClient({ transport: rpc }).reduceStream('7', 500_000_000n);

    expect(hash).toBe('abc123');
    const { id, amount, args } = preparedArgs(rpc, 'reduce_stream');
    expect(id).toBe(7n);
    expect(amount).toBe(500_000_000n);
    expect(args[0]!.switch()).toBe(xdr.ScValType.scvU64());
    expect(args[1]!.switch()).toBe(xdr.ScValType.scvI128());
  });

  it.each([
    ['topUp' as const, 'top_up'],
    ['reduceStream' as const, 'reduce_stream'],
  ])(
    '%s rejects invalid amounts before a network call or wallet prompt',
    async (method, _contractMethod) => {
      const signTransaction = vi.fn(async (txXdr: string) => txXdr);
      const client = makeClient({ transport: rpc, signTransaction });

      for (const bad of ['0', '-5', '1.5', 'ten', '']) {
        await expect(client[method](1, bad)).rejects.toThrow(/Invalid amount/);
      }
      await expect(client[method](1, 2n ** 127n)).rejects.toThrow(/Invalid amount/);

      expect(rpc.calls()).toBe(0);
      expect(signTransaction).not.toHaveBeenCalled();
      expect(rpc.prepareTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['top_up', 19, 'AMOUNT_OVERFLOW'],
    ['top_up', 20, 'REDUCTION_BELOW_VESTED'],
    ['reduce_stream', 19, 'AMOUNT_OVERFLOW'],
    ['reduce_stream', 20, 'REDUCTION_BELOW_VESTED'],
    ['reduce_stream', 21, 'INVALID_REDUCTION'],
  ] as const)(
    'maps a %s contract error #%i to %s before asking the wallet to sign',
    async (method, contractCode, code: StreamErrorCode) => {
      rpc.simulateTransaction.mockResolvedValue(
        simulationError(`HostError: Error(Contract, #${contractCode})`),
      );
      const signTransaction = vi.fn(async (txXdr: string) => txXdr);
      const client = makeClient({ transport: rpc, signTransaction });

      const error = (await (
        method === 'top_up' ? client.topUp(1, '1000') : client.reduceStream(1, '1000')
      ).catch((e: unknown) => e)) as StreamsError;

      expect(error).toBeInstanceOf(StreamsError);
      expect(error.code).toBe(code);
      expect(error.contractCode).toBe(contractCode);
      expect(error.message).toContain(`${code} (contract error #${contractCode})`);
      expect(signTransaction).not.toHaveBeenCalled();
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it('supports simulateOnly', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvVoid(), {
        transactionData: new SorobanDataBuilder().setResources(100, 200, 300),
        result: { auth: [], retval: xdr.ScVal.scvVoid() },
      }),
    );

    const result = await makeClient({ transport: rpc }).topUp(1, '1000', {
      simulateOnly: true,
    });

    expect(result).toBeInstanceOf(Object);
    expect('transaction' in result && result.transaction).toBeInstanceOf(Object);
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });
});
