import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Address,
  Asset,
  Keypair,
  Networks,
  StrKey,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { assetContractId } from './index';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  invokedCall,
  makeClient,
  mockRpc,
  sendResponse,
  simulateByMethod,
  streamScVal,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

/** A custom (non-XLM) token contract with 6 decimals, like USDC. */
const USDC_TOKEN = StrKey.encodeContract(Buffer.alloc(32, 7));

describe('arbitrary token contracts', () => {
  let rpc: ReturnType<typeof mockRpc>;

  beforeEach(() => {
    rpc = mockRpc();
    rpc.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal({
          token: USDC_TOKEN,
          total_amount: 2_500_000n,
          withdrawn: 500_000n,
          label: 'Q4 payroll',
          reference: 'INV-2026-0042',
        }),
        claimable: nativeToScVal(250_000n, { type: 'i128' }),
        decimals: nativeToScVal(6, { type: 'u32' }),
        symbol: nativeToScVal('USDC', { type: 'string' }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams a non-XLM token and reads its decimals from the token contract', async () => {
    const client = makeClient();

    const stream = await client.getStream(1);
    expect(stream?.token).toBe(USDC_TOKEN);
    expect(stream?.totalAmount).toBe('2500000');
    expect(stream?.label).toBe('Q4 payroll');
    expect(stream?.reference).toBe('INV-2026-0042');

    const metadata = await client.getTokenMetadata(stream!.token);
    expect(metadata).toEqual({ contractId: USDC_TOKEN, decimals: 6, symbol: 'USDC' });

    // Metadata is simulated against the token contract, not the stream contract.
    const tokenCalls = rpc.simulateTransaction.mock.calls
      .map(([tx]) => invokedCall(tx))
      .filter(({ method }) => method === 'decimals' || method === 'symbol');
    expect(tokenCalls).toEqual([
      { contractId: USDC_TOKEN, method: 'decimals' },
      { contractId: USDC_TOKEN, method: 'symbol' },
    ]);
  });

  it('caches token metadata per contract id', async () => {
    const client = makeClient();
    await client.getTokenMetadata(USDC_TOKEN);
    await client.getTokenMetadata(USDC_TOKEN);

    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('passes the custom token id through to create_stream', async () => {
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
    const recipient = Keypair.random().publicKey();

    await makeClient().createStream({
      sender: PUBLIC_KEY,
      recipient,
      token: USDC_TOKEN,
      amount: '2500000',
      startTime: 1_000,
      endTime: 2_000,
      cliffTime: 1_000,
    });

    const [tx] = rpc.prepareTransaction.mock.calls[0]!;
    expect(invokedCall(tx)).toEqual({ contractId: CONTRACT_ID, method: 'create_stream' });
    const args = (
      tx as unknown as { operations: Array<{ func: xdr.HostFunction }> }
    ).operations[0]!.func.invokeContract().args();
    expect(Address.fromScVal(args[2]!).toString()).toBe(USDC_TOKEN);
  });

  it('rejects a token that is not a contract id', async () => {
    const client = makeClient();
    await expect(client.getTokenMetadata('not-a-contract')).rejects.toThrow(
      'Invalid token contract id',
    );
    await expect(
      client.createStream({
        sender: PUBLIC_KEY,
        recipient: PUBLIC_KEY,
        token: PUBLIC_KEY, // a G... account, not a token contract
        amount: '1',
        startTime: 1_000,
        endTime: 2_000,
        cliffTime: 1_000,
      }),
    ).rejects.toThrow('Invalid token contract id');
    expect(rpc.calls()).toBe(0);
  });
});

describe('assetContractId', () => {
  it('resolves the native XLM SAC', () => {
    expect(assetContractId('native', Networks.TESTNET)).toBe(
      'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    );
  });

  it('resolves an issued asset from CODE:ISSUER or an Asset', () => {
    const issuer = Keypair.random().publicKey();
    const expected = new Asset('USDC', issuer).contractId(Networks.TESTNET);
    expect(assetContractId(`USDC:${issuer}`, Networks.TESTNET)).toBe(expected);
    expect(assetContractId(new Asset('USDC', issuer), Networks.TESTNET)).toBe(expected);
    expect(StrKey.isValidContract(expected)).toBe(true);
  });

  it('rejects malformed asset strings', () => {
    expect(() => assetContractId('USDC', Networks.TESTNET)).toThrow("'CODE:ISSUER'");
  });
});
