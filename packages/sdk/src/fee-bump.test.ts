import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  PUBLIC_KEY,
  feeBumpFailure,
  invokedCall,
  makeClient,
  mockRpc,
  sendResponse,
  simulationSuccess,
  trappedInnerResult,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** The account that pays the fees for every write made by these clients. */
const SPONSOR = Keypair.random().publicKey();

/** Wallets hand back the envelope they were given once the user approves it. */
const echoSigner = async (xdr: string) => xdr;

describe('fee-bump writes', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
    // Writes are simulated before being prepared; void is a valid result.
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a fee-bump envelope signed by the sponsor', async () => {
    // Typed with both arguments so the recorded call shows the options the
    // SDK hands the sponsor's signer, not just the envelope.
    const sponsorSigns = vi.fn(
      async (xdr: string, _opts: { networkPassphrase: string; address: string }) => xdr,
    );
    const client = makeClient({
      signTransaction: echoSigner,
      feeBump: { feeSource: SPONSOR, signTransaction: sponsorSigns },
    });

    await client.withdraw(1);

    const envelope = rpc.sendTransaction.mock.calls[0]![0]!;
    expect(envelope).toBeInstanceOf(FeeBumpTransaction);
    const bumped = envelope as FeeBumpTransaction;
    expect(bumped.feeSource).toBe(SPONSOR);
    // The user still pays for nothing but signs the call itself, so the
    // contract attributes the withdrawal to them.
    expect(bumped.innerTransaction.source).toBe(PUBLIC_KEY);
    expect(invokedCall(bumped.innerTransaction)).toEqual({
      contractId: CONTRACT_ID,
      method: 'withdraw',
    });

    const [signedXdr, opts] = sponsorSigns.mock.calls[0]!;
    expect(opts).toEqual({ networkPassphrase: NETWORK_PASSPHRASE, address: SPONSOR });
    expect(TransactionBuilder.fromXDR(signedXdr!, NETWORK_PASSPHRASE)).toBeInstanceOf(
      FeeBumpTransaction,
    );
  });

  it('defaults the sponsored fee to the inner transaction’s own rate', async () => {
    const client = makeClient({
      signTransaction: echoSigner,
      feeBump: { feeSource: SPONSOR, signTransaction: echoSigner },
    });

    await client.withdraw(1);

    const bumped = rpc.sendTransaction.mock.calls[0]![0] as FeeBumpTransaction;
    // One operation at the client's 1,000,000 stroop base fee, paid once for
    // the inner transaction and once for the fee-bump envelope.
    expect(BigInt(bumped.innerTransaction.fee)).toBe(1_000_000n);
    expect(bumped.fee).toBe('2000000');
  });

  it('honours an explicit sponsored base fee', async () => {
    const client = makeClient({
      signTransaction: echoSigner,
      feeBump: { feeSource: SPONSOR, signTransaction: echoSigner, baseFee: '1500000' },
    });

    await client.withdraw(1);

    const bumped = rpc.sendTransaction.mock.calls[0]![0] as FeeBumpTransaction;
    expect(bumped.fee).toBe('3000000');
  });

  it('submits the wallet-signed transaction unchanged when no hook is configured', async () => {
    const client = makeClient({ signTransaction: echoSigner });

    await client.withdraw(1);

    const envelope = rpc.sendTransaction.mock.calls[0]![0]!;
    expect(envelope).toBeInstanceOf(Transaction);
    expect(envelope).not.toBeInstanceOf(FeeBumpTransaction);
    expect(rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses to submit when the sponsor signs the wrong envelope', async () => {
    let innerXdr = '';
    const client = makeClient({
      signTransaction: async (xdr) => {
        innerXdr = xdr;
        return xdr;
      },
      feeBump: { feeSource: SPONSOR, signTransaction: async () => innerXdr },
    });

    await expect(client.withdraw(1)).rejects.toThrow(
      'must return the signed fee-bump envelope it was given',
    );
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('retries with a fresh sequence when the sponsored envelope hits a stale one', async () => {
    rpc.sendTransaction
      .mockResolvedValueOnce(
        sendResponse('ERROR', {
          errorResult: feeBumpFailure(xdr.InnerTransactionResultResult.txBadSeq()),
        }),
      )
      .mockResolvedValueOnce(sendResponse('PENDING'));
    const client = makeClient({
      signTransaction: echoSigner,
      feeBump: { feeSource: SPONSOR, signTransaction: echoSigner },
    });

    await expect(client.withdraw(1)).resolves.toEqual({ hash: 'abc123' });

    expect(rpc.sendTransaction).toHaveBeenCalledTimes(2);
    expect(rpc.getAccount).toHaveBeenCalledTimes(2);
  });

  it('reports the inner failure code of a rejected fee bump', async () => {
    rpc.sendTransaction.mockResolvedValueOnce(
      sendResponse('ERROR', { errorResult: feeBumpFailure(trappedInnerResult()) }),
    );
    const client = makeClient({
      signTransaction: echoSigner,
      feeBump: { feeSource: SPONSOR, signTransaction: echoSigner },
    });

    await expect(client.withdraw(1)).rejects.toThrow(/txFailed \(invokeHostFunctionTrapped\)/);
  });
});
