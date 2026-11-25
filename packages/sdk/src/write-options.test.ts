import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  Memo,
  MemoID,
  MemoNone,
  MemoText,
  SorobanDataBuilder,
  Transaction,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError, type SimulationResult } from './index.js';
import {
  fakeTransport,
  makeClient,
  makeEscrowClient,
  mockRpc,
  sendResponse,
  simulationError,
  simulationSuccess,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** A simulated Soroban resource footprint with the given CPU and memory use. */
function simulationWithResources(cpuInsns: number, diskReadBytes: number, writeBytes: number) {
  return simulationSuccess(xdr.ScVal.scvVoid(), {
    minResourceFee: '1234',
    transactionData: new SorobanDataBuilder().setResources(cpuInsns, diskReadBytes, writeBytes),
    result: { auth: [], retval: xdr.ScVal.scvVoid() },
  });
}

describe('custom fee and memo on writes', () => {
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

  it('overrides the default base fee and attaches a text memo', async () => {
    await makeClient().withdraw(1, {
      fee: '2500000',
      memo: { type: 'text', value: 'INV-2026-0042' },
    });

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe('2500000');
    expect(tx.memo.type).toBe(MemoText);
    expect(tx.memo.value!.toString()).toBe('INV-2026-0042');
  });

  it('attaches an id memo', async () => {
    await makeClient().withdraw(1, { memo: { type: 'id', value: '9007199254740993' } });

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.memo.type).toBe(MemoID);
    expect(tx.memo.value!.toString()).toBe('9007199254740993');
  });

  it('keeps the default fee and no memo when neither option is passed', async () => {
    await makeClient().withdraw(1);

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe('1000000');
    expect(tx.memo.type).toBe(MemoNone);
  });

  it('applies to every write path, including escrow calls', async () => {
    await makeEscrowClient().fundEscrow(1, {
      fee: '5000',
      memo: { type: 'text', value: 'escrow' },
    });

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe('5000');
    expect(tx.memo.type).toBe(MemoText);
  });

  it('rejects malformed fees and memos before any network call', async () => {
    const client = makeClient();
    await expect(client.withdraw(1, { fee: 'ten' })).rejects.toThrow('Invalid fee');
    await expect(client.withdraw(1, { fee: '0' })).rejects.toThrow('Must be greater than 0');
    await expect(
      client.withdraw(1, { memo: { type: 'id', value: '18446744073709551616' } }),
    ).rejects.toThrow('Invalid memo id');
    await expect(
      client.withdraw(1, { memo: { type: 'text', value: 'x'.repeat(29) } }),
    ).rejects.toThrow('Invalid memo text');
    expect(rpc.calls()).toBe(0);
  });
});

describe('simulateOnly dry runs', () => {
  let rpc: ReturnType<typeof fakeTransport>;
  type Signer = (
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ) => Promise<string>;
  let signTransaction: Mock<Signer>;

  beforeEach(() => {
    rpc = fakeTransport();
    signTransaction = vi.fn(
      async (xdr: string, _opts: { networkPassphrase: string; address: string }) => xdr,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the assembled transaction, resource fee and cost without submitting', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationWithResources(1_000, 200, 300));

    const result: SimulationResult = await makeClient({ transport: rpc, signTransaction }).withdraw(
      1,
      { simulateOnly: true },
    );

    expect(result).toBeInstanceOf(Object);
    expect('transaction' in result && result.transaction).toBeInstanceOf(Transaction);
    expect('minResourceFee' in result && result.minResourceFee).toBe('1234');
    expect('cpuInsns' in result && result.cpuInsns).toBe('1000');
    // 200 read bytes + 300 write bytes.
    expect('memBytes' in result && result.memBytes).toBe('500');
    expect('auth' in result && result.auth).toEqual([]);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
    expect(rpc.prepareTransaction).not.toHaveBeenCalled();
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('returns discovered auth entries', async () => {
    const auth = [{} as xdr.SorobanAuthorizationEntry];
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(xdr.ScVal.scvVoid(), {
        transactionData: new SorobanDataBuilder().setResources(10, 20, 30),
        result: { auth, retval: xdr.ScVal.scvVoid() },
      }),
    );

    const result = await makeClient({ transport: rpc, signTransaction }).withdraw(1, {
      simulateOnly: true,
    });

    expect('auth' in result && result.auth).toBe(auth);
  });

  it('does not require a wallet signer', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationWithResources(10, 20, 30));

    const result = await makeClient({ transport: rpc, signTransaction: undefined }).withdraw(1, {
      simulateOnly: true,
    });

    expect('minResourceFee' in result).toBe(true);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('still throws typed simulation errors', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationError('Simulation failed: Error(Contract, #4)'),
    );

    const error = await makeClient({ transport: rpc, signTransaction })
      .withdraw(1, { simulateOnly: true })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StreamsError);
    expect((error as StreamsError).code).toBe('STREAM_NOT_FOUND');
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('attaches fee and memo to the dry-run transaction', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationWithResources(10, 20, 30));

    const result = await makeClient({ transport: rpc, signTransaction }).withdraw(1, {
      simulateOnly: true,
      fee: '7000',
      memo: { type: 'id', value: 42 },
    });

    expect('transaction' in result && result.transaction.fee).toBe('7000');
    expect('transaction' in result && result.transaction.memo).toEqual(Memo.id('42'));
  });
});
