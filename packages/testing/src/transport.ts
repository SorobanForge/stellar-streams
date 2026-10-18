import { Account, Address, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { vi } from 'vitest';

/** The ledger sequence every fake source account starts with. */
export const DEFAULT_ACCOUNT_SEQUENCE = '100';
/** The hash every fake submission answers with unless overridden. */
export const DEFAULT_TX_HASH = 'abc123';

export interface FakeTransportOptions {
  /** Sequence number of the accounts `getAccount` returns. Defaults to `100`. */
  accountSequence?: string;
  /** Hash reported by `sendTransaction` and `getTransaction`. Defaults to `abc123`. */
  hash?: string;
  /** Status `sendTransaction` answers with. Defaults to `PENDING`. */
  sendStatus?: SorobanRpc.Api.SendTransactionStatus;
  /** Status `getTransaction` answers with. Defaults to `SUCCESS`. */
  transactionStatus?: SorobanRpc.Api.GetTransactionStatus;
  /** Return value of a simulation that `respondWith` does not answer. Defaults to void. */
  simulationResult?: xdr.ScVal;
}

/**
 * An in-memory replacement for `SorobanRpc.Server`.
 *
 * Constructing one swaps the five RPC methods the SDK (and the dashboard) call
 * for equivalents backed by canned responses, so code under test runs
 * unchanged — no network, no fixtures on disk, no prototype stubs to hand-roll.
 * Every method stays a `vi.fn`, so a test can still override a single call with
 * `mockResolvedValueOnce`/`mockRejectedValueOnce` and assert on `mock.calls`.
 *
 * Call `restore()` (or `vi.restoreAllMocks()`) when the test file is done.
 */
export type FakeTransport = ReturnType<typeof createFakeTransport>;

export function createFakeTransport(options: FakeTransportOptions = {}) {
  const proto = SorobanRpc.Server.prototype;
  const hash = options.hash ?? DEFAULT_TX_HASH;

  const getAccount = vi
    .spyOn(proto, 'getAccount')
    .mockImplementation(async (address: string) => {
      const sequence = options.accountSequence ?? DEFAULT_ACCOUNT_SEQUENCE;
      return new Account(address, sequence);
    });
  const simulateTransaction = vi
    .spyOn(proto, 'simulateTransaction')
    .mockResolvedValue(simulationSuccess(options.simulationResult ?? xdr.ScVal.scvVoid()));
  const prepareTransaction = vi
    .spyOn(proto, 'prepareTransaction')
    .mockImplementation(
      async (tx) => tx as Awaited<ReturnType<typeof proto.prepareTransaction>>,
    );
  const sendTransaction = vi
    .spyOn(proto, 'sendTransaction')
    .mockResolvedValue(sendResponse(options.sendStatus ?? 'PENDING', { hash }));
  const getTransaction = vi
    .spyOn(proto, 'getTransaction')
    .mockResolvedValue(
      txResponse(options.transactionStatus ?? SorobanRpc.Api.GetTransactionStatus.SUCCESS, {
        txHash: hash,
      }),
    );

  const spies = [
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
    /** Total RPC round trips recorded since the transport was created or reset. */
    calls: () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    /** Clears recorded calls without changing the canned answers. */
    reset: () => spies.forEach((spy) => spy.mockClear()),
    /** Restores the real `SorobanRpc.Server` methods. */
    restore: () => spies.forEach((spy) => spy.mockRestore()),
    /**
     * Answers every simulation with the ScVal registered for the simulated
     * method name, e.g. `respondWith({ get_stream: streamScVal() })`.
     */
    respondWith: (results: Record<string, xdr.ScVal>) => {
      simulateTransaction.mockImplementation(simulateByMethod(results));
    },
  };
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
  return { status, hash: DEFAULT_TX_HASH, latestLedger: 1, latestLedgerCloseTime: 0, ...extra };
}

export function txResponse(
  status: SorobanRpc.Api.GetTransactionStatus,
  extra: Record<string, unknown> = {},
): SorobanRpc.Api.GetTransactionResponse {
  return {
    status,
    txHash: DEFAULT_TX_HASH,
    latestLedger: 1,
    ...extra,
  } as unknown as SorobanRpc.Api.GetTransactionResponse;
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

/** A `txBadSeq` result, i.e. the submission used a stale sequence number. */
export function badSequenceResult(): xdr.TransactionResult {
  return new xdr.TransactionResult({
    feeCharged: xdr.Int64.fromString('0'),
    result: xdr.TransactionResultResult.txBadSeq(),
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
