import { Account, Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { vi } from 'vitest';
import { StreamsClient, type StreamsClientOptions } from './index';

export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
export const PUBLIC_KEY = Keypair.random().publicKey();

/**
 * Stubs every Soroban RPC method the client touches on `SorobanRpc.Server`'s
 * prototype, so tests exercise the real client code without a network. Each
 * stub is a `vi.fn` that tests override per case; `calls()` reports how many
 * RPC round trips were made in total.
 */
export function mockRpc() {
  const proto = SorobanRpc.Server.prototype;
  const getAccount = vi
    .spyOn(proto, 'getAccount')
    .mockImplementation(async (address: string) => new Account(address, '100'));
  const simulateTransaction = vi.spyOn(proto, 'simulateTransaction');
  const prepareTransaction = vi
    .spyOn(proto, 'prepareTransaction')
    .mockImplementation(async (tx) => tx as Awaited<ReturnType<typeof proto.prepareTransaction>>);
  const sendTransaction = vi.spyOn(proto, 'sendTransaction');
  const getTransaction = vi.spyOn(proto, 'getTransaction');

  const all = [
    getAccount,
    simulateTransaction,
    prepareTransaction,
    sendTransaction,
    getTransaction,
  ];
  return {
    getAccount,
    simulateTransaction,
    prepareTransaction,
    sendTransaction,
    getTransaction,
    calls: () => all.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    reset: () => all.forEach((spy) => spy.mockClear()),
  };
}

export function makeClient(overrides: Partial<StreamsClientOptions> = {}): StreamsClient {
  return new StreamsClient({
    contractId: CONTRACT_ID,
    rpcUrl: 'https://rpc.invalid',
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: PUBLIC_KEY,
    signTransaction: async (txXdr) => txXdr,
    pollIntervalMs: 1,
    pollTimeoutMs: 200,
    ...overrides,
  });
}

/** A successful simulation whose return value is `retval`. */
export function simulationSuccess(retval: xdr.ScVal) {
  return {
    id: '1',
    latestLedger: 1,
    events: [],
    _parsed: true,
    transactionData: undefined,
    minResourceFee: '0',
    result: { auth: [], retval },
  } as unknown as SorobanRpc.Api.SimulateTransactionResponse;
}

export function sendResponse(
  status: SorobanRpc.Api.SendTransactionStatus,
  extra: Partial<SorobanRpc.Api.SendTransactionResponse> = {},
): SorobanRpc.Api.SendTransactionResponse {
  return { status, hash: 'abc123', latestLedger: 1, latestLedgerCloseTime: 0, ...extra };
}

export function txResponse(
  status: SorobanRpc.Api.GetTransactionStatus,
  extra: Record<string, unknown> = {},
): SorobanRpc.Api.GetTransactionResponse {
  return {
    status,
    txHash: 'abc123',
    latestLedger: 1,
    ...extra,
  } as unknown as SorobanRpc.Api.GetTransactionResponse;
}

/** Encodes a `Stream` struct the way the contract's `get_stream` returns it. */
export function streamScVal(overrides: Partial<Record<string, unknown>> = {}): xdr.ScVal {
  const value = {
    cancelled: false,
    cliff_time: 1_500n,
    end_time: 2_000n,
    id: 1n,
    recipient: PUBLIC_KEY,
    sender: PUBLIC_KEY,
    start_time: 1_000n,
    token: CONTRACT_ID,
    total_amount: 1_000_000_000n,
    withdrawn: 0n,
    ...overrides,
  };
  return nativeToScVal(value, {
    type: {
      cancelled: ['symbol'],
      cliff_time: ['symbol', 'u64'],
      end_time: ['symbol', 'u64'],
      id: ['symbol', 'u64'],
      recipient: ['symbol', 'address'],
      sender: ['symbol', 'address'],
      start_time: ['symbol', 'u64'],
      token: ['symbol', 'address'],
      total_amount: ['symbol', 'i128'],
      withdrawn: ['symbol', 'i128'],
    },
  });
}

/** Answers `get_stream` with `stream` and `claimable` with `claimable`. */
export function simulateByMethod(stream: xdr.ScVal, claimable = 0n) {
  return async (tx: Parameters<SorobanRpc.Server['simulateTransaction']>[0]) => {
    const op = (tx as { operations: Array<{ func?: xdr.HostFunction }> }).operations[0];
    const method = op?.func?.invokeContract().functionName().toString();
    if (method === 'get_stream') return simulationSuccess(stream);
    return simulationSuccess(nativeToScVal(claimable, { type: 'i128' }));
  };
}
