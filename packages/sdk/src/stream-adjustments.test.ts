import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { makeClient, mockRpc, sendResponse, simulationSuccess, txResponse } from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** ScVals passed to the contract invocation prepared for submission. */
function invokeArgs(rpc: ReturnType<typeof mockRpc>): xdr.ScVal[] {
  const [tx] = rpc.prepareTransaction.mock.calls[0]!;
  const op = (tx as unknown as { operations: Array<{ func: xdr.HostFunction }> }).operations[0]!;
  return op.func.invokeContract().args();
}

describe('stream sender adjustments', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes a top-up as a u64 stream id and an i128 amount', async () => {
    const { hash } = await makeClient().topUp(7, 250);

    expect(hash).toBe('abc123');
    const args = invokeArgs(rpc);
    expect(args).toHaveLength(2);
    expect(scValToNative(args[0]!)).toBe(7n);
    expect(scValToNative(args[1]!)).toBe(250n);
  });

  it('encodes a reduction as a u64 stream id and an i128 new total', async () => {
    const { hash } = await makeClient().reduceStream('7', '40');

    expect(hash).toBe('abc123');
    const args = invokeArgs(rpc);
    expect(args).toHaveLength(2);
    expect(scValToNative(args[0]!)).toBe(7n);
    expect(scValToNative(args[1]!)).toBe(40n);
  });

  it('rejects a non-positive top-up before any network call', async () => {
    await expect(makeClient().topUp(7, 0)).rejects.toThrow('Must be greater than 0');
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a non-numeric new total before any network call', async () => {
    await expect(makeClient().reduceStream(7, 'lots')).rejects.toThrow(
      'Expected a decimal integer string',
    );
    expect(rpc.calls()).toBe(0);
  });
});
