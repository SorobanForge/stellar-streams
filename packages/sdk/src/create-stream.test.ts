import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import type { CreateStreamParams } from '@stellar-starter-kit/types';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  makeClient,
  mockRpc,
  sendResponse,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** Params that pass every client-side check, with per-test overrides. */
function validParams(overrides: Partial<CreateStreamParams> = {}): CreateStreamParams {
  return {
    sender: PUBLIC_KEY,
    recipient: Keypair.random().publicKey(),
    token: CONTRACT_ID,
    amount: '1000',
    startTime: 1_000,
    endTime: 2_000,
    cliffTime: 1_500,
    ...overrides,
  };
}

/** The ScVals of the `create_stream` invocation built for the first submission. */
function createStreamArgs(rpc: ReturnType<typeof mockRpc>): xdr.ScVal[] {
  const [tx] = rpc.prepareTransaction.mock.calls[0]!;
  const op = (tx as unknown as { operations: Array<{ func: xdr.HostFunction }> }).operations[0]!;
  return op.func.invokeContract().args();
}

describe('createStream input validation', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a malformed sender before any network call', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ sender: 'not-an-address' }))).rejects.toThrow(
      'Invalid sender',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a malformed recipient before any network call', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ recipient: 'not-an-address' }))).rejects.toThrow(
      'Invalid recipient',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a zero amount before any network call', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ amount: '0' }))).rejects.toThrow(
      'Invalid amount: 0. Must be greater than 0.',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a negative amount before any network call', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ amount: '-5' }))).rejects.toThrow(
      'Invalid amount',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a non-numeric amount before any network call', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ amount: 'ten' }))).rejects.toThrow(
      'Expected a decimal integer string',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects an endTime that is not after the startTime', async () => {
    const client = makeClient();
    await expect(
      client.createStream(validParams({ endTime: 1_000, cliffTime: 1_000 })),
    ).rejects.toThrow('Invalid endTime: 1000. Must be greater than startTime (1000).');
    expect(rpc.calls()).toBe(0);

    await expect(client.createStream(validParams({ endTime: 500 }))).rejects.toThrow(
      'Invalid endTime',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a cliffTime before the startTime', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ cliffTime: 999 }))).rejects.toThrow(
      'Invalid cliffTime: 999. Must be between startTime (1000) and endTime (2000).',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a cliffTime after the endTime', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ cliffTime: 2_001 }))).rejects.toThrow(
      'Invalid cliffTime',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a label longer than 64 bytes', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ label: 'x'.repeat(65) }))).rejects.toThrow(
      'Invalid label: 65 bytes. Must be at most 64.',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('measures the label in UTF-8 bytes, not characters', async () => {
    const client = makeClient();
    // 33 characters, but 66 bytes: over the contract's 64-byte cap.
    const label = 'é'.repeat(33);
    expect(label.length).toBe(33);
    await expect(client.createStream(validParams({ label }))).rejects.toThrow('Invalid label');
    expect(rpc.calls()).toBe(0);
  });

  it('rejects a reference longer than 128 bytes', async () => {
    const client = makeClient();
    await expect(client.createStream(validParams({ reference: 'r'.repeat(129) }))).rejects.toThrow(
      'Invalid reference: 129 bytes. Must be at most 128.',
    );
    expect(rpc.calls()).toBe(0);
  });
});

describe('createStream metadata', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the label and reference through to create_stream', async () => {
    const { hash } = await makeClient().createStream(
      validParams({ label: 'Q4 payroll', reference: 'INV-2026-0042' }),
    );

    expect(hash).toBe('abc123');
    const args = createStreamArgs(rpc);
    expect(scValToNative(args[7]!)).toBe('Q4 payroll');
    expect(scValToNative(args[8]!)).toBe('INV-2026-0042');
  });

  it('sends empty metadata when none is given', async () => {
    await makeClient().createStream(validParams());

    const args = createStreamArgs(rpc);
    expect(scValToNative(args[7]!)).toBe('');
    expect(scValToNative(args[8]!)).toBe('');
  });

  it('accepts metadata at exactly the byte limits', async () => {
    const label = 'l'.repeat(64);
    const reference = 'r'.repeat(128);
    await makeClient().createStream(validParams({ label, reference }));

    const args = createStreamArgs(rpc);
    expect(scValToNative(args[7]!)).toBe(label);
    expect(scValToNative(args[8]!)).toBe(reference);
  });
});
