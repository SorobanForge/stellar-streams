import { beforeEach, describe, expect, it } from 'vitest';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  fakeTransport,
  invokedCall,
  makeClient,
  simulateByMethod,
  simulationSuccess,
  streamScVal,
} from './test-helpers';

const TREASURY = Keypair.random().publicKey();

describe('read call decoding', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal({
          id: 7n,
          total_amount: 5_000_000_000n,
          withdrawn: 1_250_000_000n,
          start_time: 1_700_000_000n,
          end_time: 1_700_086_400n,
          cliff_time: 1_700_003_600n,
          cancelled: true,
        }),
        get_config: nativeToScVal(
          { admin: PUBLIC_KEY, treasury: TREASURY, fee_bps: 250 },
          {
            type: {
              admin: ['symbol', 'address'],
              treasury: ['symbol', 'address'],
              fee_bps: ['symbol', 'u32'],
            },
          },
        ),
        claimable: nativeToScVal(1_250_000_000n, { type: 'i128' }),
        vested: nativeToScVal(2_500_000_000n, { type: 'i128' }),
        next_stream_id: nativeToScVal(9_007_199_254_740_993n, { type: 'u64' }),
      }),
    );
  });

  it('decodes get_stream into the domain Stream shape', async () => {
    const stream = await makeClient({ transport: rpc }).getStream(7);

    expect(stream).toEqual({
      id: '7',
      sender: PUBLIC_KEY,
      recipient: PUBLIC_KEY,
      token: CONTRACT_ID,
      totalAmount: '5000000000',
      withdrawn: '1250000000',
      startTime: 1_700_000_000,
      endTime: 1_700_086_400,
      cliffTime: 1_700_003_600,
      cancelled: true,
      label: '',
      reference: '',
    });
  });

  it('returns null for a stream that does not exist', async () => {
    // `get_stream` returns Option<Stream>; None decodes to a void ScVal.
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));

    await expect(makeClient({ transport: rpc }).getStream(99)).resolves.toBeNull();
  });

  it('decodes get_config with the fee in basis points', async () => {
    const config = await makeClient({ transport: rpc }).getConfig();

    expect(config).toEqual({ admin: PUBLIC_KEY, treasury: TREASURY, feeBps: 250 });
  });

  it('returns null for an uninitialized contract', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));

    await expect(makeClient({ transport: rpc }).getConfig()).resolves.toBeNull();
  });

  it('decodes claimable and vested as bigint amounts', async () => {
    const client = makeClient({ transport: rpc });

    await expect(client.claimable(7)).resolves.toBe(1_250_000_000n);
    await expect(client.vested(7)).resolves.toBe(2_500_000_000n);
  });

  it('decodes next_stream_id as a bigint without precision loss', async () => {
    // 2^53 + 1 is the first integer a JavaScript number cannot represent.
    await expect(makeClient({ transport: rpc }).nextStreamId()).resolves.toBe(
      9_007_199_254_740_993n,
    );
  });

  it('addresses the reads to the configured contract', async () => {
    const client = makeClient({ transport: rpc });
    await client.getStream(7);
    await client.nextStreamId();

    const methods = rpc.simulateTransaction.mock.calls.map(([tx]) => invokedCall(tx));
    expect(methods).toEqual([
      { contractId: CONTRACT_ID, method: 'get_stream' },
      { contractId: CONTRACT_ID, method: 'next_stream_id' },
    ]);
  });
});
