import { Account, Address, Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
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

/** A failed simulation whose RPC error message is `error`. */
export function simulationError(error: string) {
  return {
    id: '1',
    latestLedger: 1,
    events: [],
    _parsed: true,
    error,
  } as unknown as SorobanRpc.Api.SimulateTransactionErrorResponse;
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
    label: '',
    recipient: PUBLIC_KEY,
    reference: '',
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
      label: ['symbol', 'string'],
      recipient: ['symbol', 'address'],
      reference: ['symbol', 'string'],
      sender: ['symbol', 'address'],
      start_time: ['symbol', 'u64'],
      token: ['symbol', 'address'],
      total_amount: ['symbol', 'i128'],
      withdrawn: ['symbol', 'i128'],
    },
  });
}

/** A `txFailed` result whose operation was a trapped contract invocation. */
export function trappedResult(): xdr.TransactionResult {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('100'),
    result: xdr.TransactionResultResult.txFailed([
      xdr.OperationResult.opInner(
        xdr.OperationResultTr.invokeHostFunction(
          xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped(),
        ),
      ),
    ]),
    ext: new xdr.TransactionResultExt(0),
  });
}

/** A host diagnostic event reporting `Error(Contract, #code)` and a message. */
export function contractErrorEvent(code: number, message: string): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: null,
      type: xdr.ContractEventType.diagnostic(),
      body: new xdr.ContractEventBody(
        0,
        new xdr.ContractEventV0({
          topics: [xdr.ScVal.scvSymbol('error'), xdr.ScVal.scvError(xdr.ScError.sceContract(code))],
          data: xdr.ScVal.scvString(message),
        }),
      ),
    }),
  });
}

/** The contract and method a simulated transaction invokes. */
export function invokedCall(tx: unknown): { contractId: string; method: string } {
  const op = (tx as { operations: Array<{ func?: xdr.HostFunction }> }).operations[0];
  const call = op!.func!.invokeContract();
  return {
    contractId: Address.fromScAddress(call.contractAddress()).toString(),
    method: call.functionName().toString(),
  };
}

/** Answers each simulated call with the ScVal registered for its method name. */
export function simulateByMethod(results: Record<string, xdr.ScVal>) {
  return async (tx: Parameters<SorobanRpc.Server['simulateTransaction']>[0]) => {
    const { method } = invokedCall(tx);
    const retval = results[method];
    if (!retval) throw new Error(`Unexpected simulation of ${method}`);
    return simulationSuccess(retval);
  };
}
