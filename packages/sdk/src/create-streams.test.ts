import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, MemoText, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { MAX_BATCH_STREAMS, StreamsError } from './index.js';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  makeClient,
  mockRpc,
  sendResponse,
  simulationError,
  simulationSuccess,
  txResponse,
} from './test-helpers';
import type { CreateStreamsEntry, CreateStreamsParams } from './index.js';

const { GetTransactionStatus } = SorobanRpc.Api;

/** An entry that passes every client-side check, with per-test overrides. */
function validEntry(overrides: Partial<CreateStreamsEntry> = {}): CreateStreamsEntry {
  return {
    recipient: Keypair.random().publicKey(),
    amount: '1000',
    startTime: 1_000,
    endTime: 2_000,
    cliffTime: 1_500,
    ...overrides,
  };
}

/** Params that pass every client-side check, with per-test overrides. */
function validParams(overrides: Partial<CreateStreamsParams> = {}): CreateStreamsParams {
  return {
    sender: PUBLIC_KEY,
    token: CONTRACT_ID,
    entries: [validEntry(), validEntry()],
    ...overrides,
  };
}

/** The ScVals of the `create_streams` invocation built for the first submission. */
function createStreamsArgs(rpc: ReturnType<typeof mockRpc>): xdr.ScVal[] {
  const [tx] = rpc.prepareTransaction.mock.calls[0]!;
  const op = (tx as unknown as { operations: Array<{ func: xdr.HostFunction }> }).operations[0]!;
  return op.func.invokeContract().args();
}

/** Scripts a batch that simulates, submits and confirms successfully. */
function scriptSuccessfulBatch(rpc: ReturnType<typeof mockRpc>, ids: bigint[] = [7n, 8n]): void {
  rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
  rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
  rpc.getTransaction.mockResolvedValue(
    txResponse(GetTransactionStatus.SUCCESS, {
      returnValue: nativeToScVal(ids, { type: 'u64' }),
    }),
  );
}

describe('createStreams input validation', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an empty batch before any network call', async () => {
    await expect(makeClient().createStreams(validParams({ entries: [] }))).rejects.toThrow(
      'Invalid entries: a batch must contain at least one stream.',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a batch larger than MAX_BATCH_STREAMS before any network call', async () => {
    const entries = Array.from({ length: MAX_BATCH_STREAMS + 1 }, () => validEntry());
    await expect(makeClient().createStreams(validParams({ entries }))).rejects.toThrow(
      `Invalid entries: ${MAX_BATCH_STREAMS + 1} streams. A batch may contain at most ${MAX_BATCH_STREAMS}.`,
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a malformed sender or token before any network call', async () => {
    await expect(
      makeClient().createStreams(validParams({ sender: 'not-an-address' })),
    ).rejects.toThrow('Invalid sender');
    await expect(makeClient().createStreams(validParams({ token: PUBLIC_KEY }))).rejects.toThrow(
      'Invalid token contract id',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('reuses the per-entry validators from createStream', async () => {
    await expect(
      makeClient().createStreams(
        validParams({ entries: [validEntry(), validEntry({ recipient: 'not-an-address' })] }),
      ),
    ).rejects.toThrow('Invalid recipient');
    await expect(
      makeClient().createStreams(validParams({ entries: [validEntry({ amount: '0' })] })),
    ).rejects.toThrow('Invalid amount: 0. Must be greater than 0.');
    await expect(
      makeClient().createStreams(
        validParams({ entries: [validEntry({ startTime: 2_000, endTime: 2_000 })] }),
      ),
    ).rejects.toThrow('Invalid endTime');
    await expect(
      makeClient().createStreams(validParams({ entries: [validEntry({ cliffTime: 999 })] })),
    ).rejects.toThrow('Invalid cliffTime');
    expect(rpc.calls()).toBe(0);
  });
});

describe('createStreams encoding and result', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
    scriptSuccessfulBatch(rpc);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encodes the contract tuple in its declared order', async () => {
    const first = validEntry();
    const second = validEntry();
    await makeClient().createStreams(validParams({ entries: [first, second] }));

    const args = createStreamsArgs(rpc);
    expect(scValToNative(args[0]!)).toBe(PUBLIC_KEY);
    expect(scValToNative(args[1]!)).toBe(CONTRACT_ID);

    // Each entry is (recipient, amount, start_time, cliff_time, end_time): the
    // cliff precedes the end time, matching `create_streams` in the contract.
    expect(scValToNative(args[2]!)).toEqual([
      [first.recipient, 1000n, 1000n, 1500n, 2000n],
      [second.recipient, 1000n, 1000n, 1500n, 2000n],
    ]);
  });

  it('resolves with the created ids in input order plus the hash', async () => {
    scriptSuccessfulBatch(rpc, [11n, 12n]);
    const result = await makeClient().createStreams(validParams());

    expect(result).toEqual({ hash: 'abc123', ids: [11n, 12n] });
  });

  it('accepts exactly MAX_BATCH_STREAMS entries', async () => {
    const entries = Array.from({ length: MAX_BATCH_STREAMS }, () => validEntry());
    const result = await makeClient().createStreams(validParams({ entries }));

    expect(result).toHaveProperty('hash', 'abc123');
    expect(scValToNative(createStreamsArgs(rpc)[2]!)).toHaveLength(MAX_BATCH_STREAMS);
  });

  it('passes WriteOptions through to the submission', async () => {
    await makeClient().createStreams(validParams(), {
      fee: '2500000',
      memo: { type: 'text', value: 'payroll' },
    });

    const tx = rpc.simulateTransaction.mock.calls[0]![0] as Transaction;
    expect(tx.fee).toBe('2500000');
    expect(tx.memo.type).toBe(MemoText);
    expect(tx.memo.value!.toString()).toBe('payroll');
  });
});

describe('createStreams contract error mapping', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a simulated EMPTY_BATCH error', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #13)'));

    const error = (await makeClient()
      .createStreams(validParams())
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBe('EMPTY_BATCH');
    expect(error.contractCode).toBe(13);
  });

  it('maps a simulated BATCH_TOO_LARGE error', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #14)'));

    const error = (await makeClient()
      .createStreams(validParams())
      .catch((e: unknown) => e)) as StreamsError;
    expect(error).toBeInstanceOf(StreamsError);
    expect(error.code).toBe('BATCH_TOO_LARGE');
    expect(error.contractCode).toBe(14);
  });

  it('rejects an aborted call before it reaches the network', async () => {
    const controller = new AbortController();
    controller.abort();

    const error = (await makeClient()
      .createStreams(validParams(), { signal: controller.signal })
      .catch((e: unknown) => e)) as Error;
    expect(error.name).toBe('AbortError');
    expect(rpc.calls()).toBe(0);
  });
});
