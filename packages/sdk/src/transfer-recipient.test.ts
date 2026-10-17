import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair, scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsError } from './index';
import {
  PUBLIC_KEY,
  invokedCall,
  makeClient,
  mockRpc,
  sendResponse,
  simulateByMethod,
  simulationError,
  simulationSuccess,
  streamScVal,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

describe('transferRecipient', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a malformed new recipient before any network call', async () => {
    await expect(makeClient().transferRecipient(1, 'not-an-address')).rejects.toThrow(
      'Invalid newRecipient: not-an-address.',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('requires a connected wallet to act as the caller', async () => {
    const client = makeClient({ publicKey: undefined });
    await expect(client.transferRecipient(1, Keypair.random().publicKey())).rejects.toThrow(
      'A connected wallet is required to submit transactions.',
    );
    expect(rpc.calls()).toBe(0);
  });

  it('invokes transfer_recipient with the stream id, the wallet as caller and the new recipient', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
    const newRecipient = Keypair.random().publicKey();

    const { hash } = await makeClient().transferRecipient(7n, newRecipient);

    expect(hash).toBe('abc123');
    const [tx] = rpc.prepareTransaction.mock.calls[0]!;
    expect(invokedCall(tx).method).toBe('transfer_recipient');
    const op = (tx as unknown as { operations: Array<{ func: xdr.HostFunction }> }).operations[0]!;
    const args = op.func.invokeContract().args();
    expect(args).toHaveLength(3);
    expect(args[0]!.switch()).toBe(xdr.ScValType.scvU64());
    expect(scValToNative(args[0]!)).toBe(7n);
    expect(scValToNative(args[1]!)).toBe(PUBLIC_KEY);
    expect(scValToNative(args[2]!)).toBe(newRecipient);
  });

  it.each([
    [6, 'UNAUTHORIZED'],
    [12, 'SAME_RECIPIENT'],
  ] as const)(
    'surfaces contract error #%i as %s before asking the wallet to sign',
    async (contractCode, code) => {
      rpc.simulateTransaction.mockResolvedValue(
        simulationError(`HostError: Error(Contract, #${contractCode})`),
      );
      const signTransaction = vi.fn(async (txXdr: string) => txXdr);

      const error = (await makeClient({ signTransaction })
        .transferRecipient(1, Keypair.random().publicKey())
        .catch((e: unknown) => e)) as StreamsError;

      expect(error).toBeInstanceOf(StreamsError);
      expect(error.code).toBe(code);
      expect(error.contractCode).toBe(contractCode);
      expect(signTransaction).not.toHaveBeenCalled();
      expect(rpc.sendTransaction).not.toHaveBeenCalled();
    },
  );

  it('decodes a transferred stream with the same shape, carrying the new recipient', async () => {
    const newRecipient = Keypair.random().publicKey();
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal({ recipient: newRecipient, withdrawn: 300_000_000n }),
      }),
    );

    const stream = await makeClient().getStream(1);

    expect(stream).toMatchObject({
      id: '1',
      sender: PUBLIC_KEY,
      recipient: newRecipient,
      withdrawn: '300000000',
      totalAmount: '1000000000',
      cancelled: false,
    });
  });
});
