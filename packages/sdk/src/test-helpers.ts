import {
  Account,
  Address,
  Contract,
  Keypair,
  StrKey,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { vi } from 'vitest';
import {
  EscrowClient,
  StreamsClient,
  type StreamsClientOptions,
  type StreamsTransport,
} from './index.js';

export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 1));
export const PUBLIC_KEY = Keypair.random().publicKey();
/** The tip reported by the stubbed `getLatestLedger`. */
export const LATEST_LEDGER = 5_000;

/**
 * An in-memory `StreamsTransport` used by the suite in place of a real Soroban
 * RPC server. Each method is a `vi.fn` whose answer tests script per case; a
 * method with no sensible default rejects loudly, so an unstubbed call can
 * never silently fall through to the network.
 */
export class FakeTransport implements StreamsTransport {
  readonly getAccount = vi.fn<StreamsTransport['getAccount']>(
    async (address) => new Account(address, '100'),
  );

  readonly simulateTransaction = vi.fn<StreamsTransport['simulateTransaction']>(async () => {
    throw new Error('simulateTransaction was not scripted for this test');
  });

  readonly prepareTransaction = vi.fn<StreamsTransport['prepareTransaction']>(async (tx) => tx);

  readonly sendTransaction = vi.fn<StreamsTransport['sendTransaction']>(async () => {
    throw new Error('sendTransaction was not scripted for this test');
  });

  readonly getTransaction = vi.fn<StreamsTransport['getTransaction']>(async () => {
    throw new Error('getTransaction was not scripted for this test');
  });

  readonly getLatestLedger = vi.fn<StreamsTransport['getLatestLedger']>(async () => ({
    id: 'ledger-hash',
    sequence: LATEST_LEDGER,
    protocolVersion: '22',
  }));

  readonly getEvents = vi.fn<StreamsTransport['getEvents']>(async () => {
    throw new Error('getEvents was not scripted for this test');
  });

  /** How many RPC round trips have been made through this transport in total. */
  calls(): number {
    return TRANSPORT_METHODS.reduce((sum, method) => sum + this[method].mock.calls.length, 0);
  }

  /** Clears the recorded calls, keeping the scripted answers. */
  reset(): void {
    for (const method of TRANSPORT_METHODS) this[method].mockClear();
  }
}

const TRANSPORT_METHODS = [
  'getAccount',
  'simulateTransaction',
  'prepareTransaction',
  'sendTransaction',
  'getTransaction',
  'getLatestLedger',
  'getEvents',
] as const;

export function fakeTransport(): FakeTransport {
  return new FakeTransport();
}

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
  const getLatestLedger = vi
    .spyOn(proto, 'getLatestLedger')
    .mockImplementation(async () =>
      Promise.resolve({ id: 'ledger-hash', sequence: LATEST_LEDGER, protocolVersion: '22' }),
    );
  const getEvents = vi.spyOn(proto, 'getEvents');

  const all = [
    getAccount,
    simulateTransaction,
    prepareTransaction,
    sendTransaction,
    getTransaction,
    getLatestLedger,
    getEvents,
  ];
  return {
    getAccount,
    simulateTransaction,
    prepareTransaction,
    sendTransaction,
    getTransaction,
    getLatestLedger,
    getEvents,
    calls: () => all.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    reset: () => all.forEach((spy) => spy.mockClear()),
  };
}

function clientOptions(overrides: Partial<StreamsClientOptions> = {}): StreamsClientOptions {
  return {
    contractId: CONTRACT_ID,
    rpcUrl: 'https://rpc.invalid',
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey: PUBLIC_KEY,
    signTransaction: async (txXdr) => txXdr,
    pollIntervalMs: 1,
    pollTimeoutMs: 200,
    ...overrides,
  };
}

export function makeClient(overrides: Partial<StreamsClientOptions> = {}): StreamsClient {
  return new StreamsClient(clientOptions(overrides));
}

export function makeEscrowClient(overrides: Partial<StreamsClientOptions> = {}): EscrowClient {
  return new EscrowClient(clientOptions(overrides));
}

/** A successful simulation whose return value is `retval`. */
export function simulationSuccess(retval: xdr.ScVal, overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    latestLedger: 1,
    events: [],
    _parsed: true,
    transactionData: undefined,
    minResourceFee: '0',
    result: { auth: [], retval },
    ...overrides,
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

/** Encodes an `Escrow` struct the way the contract's `get_escrow` returns it. */
export function escrowScVal(overrides: Partial<Record<string, unknown>> = {}): xdr.ScVal {
  const value = {
    amount: 500_000_000n,
    arbiter: PUBLIC_KEY,
    deadline: 2_000n,
    id: 1n,
    payee: Keypair.random().publicKey(),
    payer: PUBLIC_KEY,
    status: 0,
    token: CONTRACT_ID,
    ...overrides,
  };
  return nativeToScVal(value, {
    type: {
      amount: ['symbol', 'i128'],
      arbiter: ['symbol', 'address'],
      deadline: ['symbol', 'u64'],
      id: ['symbol', 'u64'],
      payee: ['symbol', 'address'],
      payer: ['symbol', 'address'],
      status: ['symbol', 'u32'],
      token: ['symbol', 'address'],
    },
  });
}

/** The operation results of a trapped contract invocation. */
function trappedOperations(): xdr.OperationResult[] {
  return [
    xdr.OperationResult.opInner(
      xdr.OperationResultTr.invokeHostFunction(
        xdr.InvokeHostFunctionResult.invokeHostFunctionTrapped(),
      ),
    ),
  ];
}

/** A `txFailed` result whose operation was a trapped contract invocation. */
export function trappedResult(): xdr.TransactionResult {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('100'),
    result: xdr.TransactionResultResult.txFailed(trappedOperations()),
    ext: new xdr.TransactionResultExt(0),
  });
}

/**
 * The result a fee-bump submission carries when the inner transaction failed:
 * the inner result sits one level deeper than an ordinary transaction's.
 */
export function feeBumpFailure(inner: xdr.InnerTransactionResultResult): xdr.TransactionResult {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('100'),
    result: xdr.TransactionResultResult.txFeeBumpInnerFailed(
      new xdr.InnerTransactionResultPair({
        transactionHash: Buffer.alloc(32, 3),
        result: new xdr.InnerTransactionResult({
          feeCharged: xdr.Int64.fromString('100'),
          result: inner,
          ext: new xdr.InnerTransactionResultExt(0),
        }),
      }),
    ),
    ext: new xdr.TransactionResultExt(0),
  });
}

/** A trapped contract invocation as the inner result of a fee bump. */
export function trappedInnerResult(): xdr.InnerTransactionResultResult {
  return xdr.InnerTransactionResultResult.txFailed(trappedOperations());
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
  return async (tx: Parameters<StreamsTransport['simulateTransaction']>[0]) => {
    const { method } = invokedCall(tx);
    const retval = results[method];
    if (!retval) throw new Error(`Unexpected simulation of ${method}`);
    return simulationSuccess(retval);
  };
}

/** The arguments of the contract call a simulated transaction invokes. */
export function invokedArgs(tx: unknown): xdr.ScVal[] {
  const op = (tx as { operations: Array<{ func?: xdr.HostFunction }> }).operations[0];
  return op!.func!.invokeContract().args();
}

/**
 * A `("stream", "created", id)` contract event as `getEvents` returns it,
 * carrying the named `(sender, recipient, amount, label, reference)` payload
 * the stream contract emits today (see `StreamCreated` in
 * `contracts/stream/src/lib.rs`), which `./events`' `decodeStreamEvent` reads.
 */
export function createdEvent(
  id: bigint | number,
  overrides: Record<string, unknown> = {},
): SorobanRpc.Api.EventResponse {
  const {
    sender = PUBLIC_KEY,
    recipient = PUBLIC_KEY,
    amount = 1_000_000_000n,
    ...event
  } = overrides as { sender?: string; recipient?: string; amount?: bigint };
  return {
    id: '0000000001-0000000001',
    type: 'contract',
    ledger: 100,
    contractId: new Contract(CONTRACT_ID),
    topic: [
      xdr.ScVal.scvSymbol('stream'),
      xdr.ScVal.scvSymbol('created'),
      nativeToScVal(BigInt(id), { type: 'u64' }),
    ],
    value: nativeToScVal(
      { amount, label: '', recipient, reference: '', sender },
      {
        type: {
          amount: ['symbol', 'i128'],
          label: ['symbol', 'string'],
          recipient: ['symbol', 'address'],
          reference: ['symbol', 'string'],
          sender: ['symbol', 'address'],
        },
      },
    ),
    inSuccessfulContractCall: true,
    txHash: 'ab'.repeat(32),
    transactionIndex: 1,
    operationIndex: 1,
    ...event,
  } as unknown as SorobanRpc.Api.EventResponse;
}

/** One page of `getEvents` results, as the RPC shapes them. */
export function eventsPage(
  events: SorobanRpc.Api.EventResponse[],
  overrides: Record<string, unknown> = {},
): SorobanRpc.Api.GetEventsResponse {
  return {
    events,
    cursor: `${LATEST_LEDGER}-${events.length}`,
    latestLedger: LATEST_LEDGER,
    oldestLedger: 1,
    oldestLedgerCursor: '1-0',
    latestLedgerCursor: `${LATEST_LEDGER}-0`,
    ...overrides,
  } as unknown as SorobanRpc.Api.GetEventsResponse;
}
