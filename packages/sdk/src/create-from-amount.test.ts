import { afterEach, describe, expect, it, vi } from 'vitest';
import { Keypair, StrKey, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import type { CreateStreamFromAmountParams } from './index';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  fakeTransport,
  invokedArgs,
  invokedCall,
  makeClient,
  sendResponse,
  simulateByMethod,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** A token contract id distinct from the stream contract. */
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 9));

/** Params that pass every client-side check, with per-test overrides. */
function validParams(
  overrides: Partial<CreateStreamFromAmountParams> = {},
): CreateStreamFromAmountParams {
  return {
    sender: PUBLIC_KEY,
    recipient: Keypair.random().publicKey(),
    token: TOKEN,
    amount: '12.5',
    startTime: 1_000,
    endTime: 2_000,
    cliffTime: 1_000,
    ...overrides,
  };
}

/**
 * A transport that answers token metadata reads for `decimals` and the
 * `create_stream` pre-flight simulation. The number of metadata calls is
 * visible in `rpc.simulateTransaction.mock.calls`.
 */
function metadataRpc(decimals: number) {
  const rpc = fakeTransport();
  rpc.simulateTransaction.mockImplementation(
    simulateByMethod({
      decimals: nativeToScVal(decimals, { type: 'u32' }),
      symbol: nativeToScVal('TOK', { type: 'string' }),
      create_stream: xdr.ScVal.scvVoid(),
    }),
  );
  rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
  rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  return rpc;
}

/** The `i128` amount argument of the `create_stream` call the client prepared. */
function createdAmount(rpc: ReturnType<typeof fakeTransport>): bigint {
  const [tx] = rpc.prepareTransaction.mock.calls[0]!;
  expect(invokedCall(tx)).toEqual({ contractId: CONTRACT_ID, method: 'create_stream' });
  return scValToNative(invokedArgs(tx)[3]!) as bigint;
}

/** Number of token-metadata simulations made so far. */
function metadataCalls(rpc: ReturnType<typeof fakeTransport>): number {
  return rpc.simulateTransaction.mock.calls.filter(([tx]) => {
    const { method } = invokedCall(tx);
    return method === 'decimals' || method === 'symbol';
  }).length;
}

describe('createStreamFromAmount', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales a decimal string by 7 token decimals', async () => {
    rpc = metadataRpc(7);
    await makeClient({ transport: rpc }).createStreamFromAmount(validParams({ amount: '12.5' }));

    expect(createdAmount(rpc)).toBe(125_000_000n);
  });

  it('scales by 6 decimals like USDC', async () => {
    rpc = metadataRpc(6);
    await makeClient({ transport: rpc }).createStreamFromAmount(
      validParams({ amount: '1.234567' }),
    );

    expect(createdAmount(rpc)).toBe(1_234_567n);
  });

  it('works with a 0-decimal token', async () => {
    rpc = metadataRpc(0);
    await makeClient({ transport: rpc }).createStreamFromAmount(validParams({ amount: '42' }));

    expect(createdAmount(rpc)).toBe(42n);
  });

  it('truncates fraction digits beyond the token precision', async () => {
    rpc = metadataRpc(6);
    await makeClient({ transport: rpc }).createStreamFromAmount(
      validParams({ amount: '1.23456789' }),
    );

    expect(createdAmount(rpc)).toBe(1_234_567n);
  });

  it('truncates a fraction entirely for a 0-decimal token', async () => {
    rpc = metadataRpc(0);
    await makeClient({ transport: rpc }).createStreamFromAmount(validParams({ amount: '42.9' }));

    expect(createdAmount(rpc)).toBe(42n);
  });

  it('reads token metadata only once per token', async () => {
    rpc = metadataRpc(7);
    const client = makeClient({ transport: rpc });

    await client.createStreamFromAmount(validParams({ amount: '1' }));
    expect(metadataCalls(rpc)).toBe(2); // decimals + symbol

    await client.createStreamFromAmount(validParams({ amount: '2' }));
    expect(metadataCalls(rpc)).toBe(2); // cached on the second call
    expect(rpc.prepareTransaction).toHaveBeenCalledTimes(2);
  });

  it('rejects a human amount that scales to zero without writing', async () => {
    rpc = metadataRpc(2);
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);

    await expect(
      makeClient({ transport: rpc, signTransaction }).createStreamFromAmount(
        validParams({ amount: '0.009' }),
      ),
    ).rejects.toThrow('Invalid amount: 0.009. Must be greater than 0.');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
  });

  it('rejects a malformed human amount without preparing or signing a transaction', async () => {
    rpc = metadataRpc(7);
    const signTransaction = vi.fn(async (txXdr: string) => txXdr);
    await expect(
      makeClient({ transport: rpc, signTransaction }).createStreamFromAmount(
        validParams({ amount: 'twelve' }),
      ),
    ).rejects.toThrow('Invalid token amount');
    expect(signTransaction).not.toHaveBeenCalled();
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
  });

  it('validates the other fields before the metadata lookup', async () => {
    rpc = metadataRpc(7);
    await expect(
      makeClient({ transport: rpc }).createStreamFromAmount(
        validParams({ sender: 'not-an-address' }),
      ),
    ).rejects.toThrow('Invalid sender');
    await expect(
      makeClient({ transport: rpc }).createStreamFromAmount(validParams({ endTime: 1_000 })),
    ).rejects.toThrow('Invalid endTime');
    expect(rpc.calls()).toBe(0);
  });

  it('leaves the stroop-based createStream unchanged', async () => {
    rpc = metadataRpc(7);
    await makeClient({ transport: rpc }).createStream({
      ...validParams(),
      amount: '125000000',
    });

    expect(createdAmount(rpc)).toBe(125_000_000n);
    expect(metadataCalls(rpc)).toBe(0); // createStream never reads token metadata
  });
});
