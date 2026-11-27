import { beforeEach, describe, expect, it } from 'vitest';
import { nativeToScVal, scValToNative } from '@stellar/stellar-sdk';
import { StreamsError } from './index.js';
import {
  CONTRACT_ID,
  fakeTransport,
  invokedArgs,
  invokedCall,
  makeClient,
  simulationError,
  simulationSuccess,
} from './test-helpers';

/** Encodes a `VestingSummary` struct the way the contract's `vesting_summary` returns it. */
function vestingSummaryScVal(vested: bigint, claimable: bigint) {
  return nativeToScVal(
    { claimable, vested },
    { type: { claimable: ['symbol', 'i128'], vested: ['symbol', 'i128'] } },
  );
}

describe('getVestingSummary', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
  });

  it('reads vested and claimable together as bigint amounts', async () => {
    // Above 2^53, so a lossy number conversion would be caught.
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(vestingSummaryScVal(9_007_199_254_740_993n, 1_250_000_000n)),
    );

    const summary = await makeClient({ transport: rpc }).getVestingSummary(7);

    expect(summary).toEqual({ vested: 9_007_199_254_740_993n, claimable: 1_250_000_000n });
    expect(typeof summary.vested).toBe('bigint');
    expect(typeof summary.claimable).toBe('bigint');

    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1);
    const tx = rpc.simulateTransaction.mock.calls[0]![0];
    expect(invokedCall(tx)).toEqual({ contractId: CONTRACT_ID, method: 'vesting_summary' });
    const args = invokedArgs(tx);
    expect(args).toHaveLength(1);
    expect(args[0]!.switch().name).toBe('scvU64');
    expect(scValToNative(args[0]!)).toBe(7n);
  });

  it('accepts the id as a decimal string or bigint', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(vestingSummaryScVal(0n, 0n)));
    const client = makeClient({ transport: rpc });

    await expect(client.getVestingSummary('18446744073709551615')).resolves.toEqual({
      vested: 0n,
      claimable: 0n,
    });
    await client.getVestingSummary(3n);

    const ids = rpc.simulateTransaction.mock.calls.map(([tx]) =>
      scValToNative(invokedArgs(tx)[0]!),
    );
    expect(ids).toEqual([18_446_744_073_709_551_615n, 3n]);
  });

  it('surfaces a missing stream as STREAM_NOT_FOUND', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationError('HostError: Error(Contract, #4) stream not found'),
    );

    const error = await makeClient({ transport: rpc })
      .getVestingSummary(404)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(StreamsError);
    expect((error as StreamsError).code).toBe('STREAM_NOT_FOUND');
    expect((error as StreamsError).contractCode).toBe(4);
    expect((error as StreamsError).message).toContain('Simulation of vesting_summary failed');
  });

  it('rejects a response that is not a VestingSummary', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal(5n, { type: 'i128' })),
    );

    await expect(makeClient({ transport: rpc }).getVestingSummary(7)).rejects.toThrow(
      'Invalid vesting summary contract response',
    );
  });
});
