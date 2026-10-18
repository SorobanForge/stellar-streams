import { afterEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  fakeTransport,
  makeClient,
  sendResponse,
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

describe('cancelling writes with an AbortSignal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with AbortError before any RPC call or wallet prompt', async () => {
    const rpc = writableTransport();
    const controller = new AbortController();
    controller.abort();
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);

    const error = (await makeClient({ transport: rpc, signTransaction })
      .withdraw(1, { signal: controller.signal })
      .catch((e: unknown) => e)) as Error;

    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('This operation was aborted');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.calls()).toBe(0);
  });

  it('aborting while the wallet prompt is open prevents the submission', async () => {
    const rpc = writableTransport();
    const controller = new AbortController();
    const signTransaction = vi.fn(async (txXdr: string) => {
      // The user closed the tab/wallet while the prompt was up.
      controller.abort();
      return txXdr;
    });

    const error = (await makeClient({ transport: rpc, signTransaction })
      .withdraw(1, { signal: controller.signal })
      .catch((e: unknown) => e)) as Error;

    expect(error.name).toBe('AbortError');
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('aborting during the confirmation poll rejects at once and clears the timer', async () => {
    vi.useFakeTimers();
    const rpc = writableTransport();
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.NOT_FOUND));
    const controller = new AbortController();

    const settled = makeClient({ transport: rpc, pollIntervalMs: 1_000, pollTimeoutMs: 60_000 })
      .withdraw(1, { signal: controller.signal })
      .catch((e: unknown) => e);

    // Let the write reach the poll's wait between two confirmations.
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();
    const error = (await settled) as Error;

    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('This operation was aborted');
    // The pending poll timer was cleared, not left dangling.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates a custom abort reason and honours a client-level signal', async () => {
    const rpc = writableTransport();
    const controller = new AbortController();
    controller.abort(new Error('dashboard unmounted'));

    const error = (await makeClient({ transport: rpc, signal: controller.signal })
      .withdraw(1)
      .catch((e: unknown) => e)) as Error;

    expect(error.message).toBe('dashboard unmounted');
    expect(rpc.calls()).toBe(0);
  });
});
