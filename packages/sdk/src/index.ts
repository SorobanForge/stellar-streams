import {
  Account,
  Address,
  Asset,
  Contract,
  FeeBumpTransaction,
  Memo,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
// Explicit extension: tsc keeps this specifier as written in dist, and Node's
// ESM resolver will not load a directory, so the published entry fails without it.
import { decodeStreamEvent } from './events.js';
// Type-only: the SDK never imports another workspace package at runtime, so
// its tests run in CI's `test` job straight off a checkout with no build step.
import type {
  CreateEscrowParams,
  CreateStreamParams,
  Escrow,
  Stream,
  StreamConfig,
} from '@stellar-starter-kit/types';
import { normalizeConfig, normalizeEscrow, normalizeStream } from '@stellar-starter-kit/types';

/**
 * A memo attached to a write transaction. Text memos are for exchange-style
 * deposit tags; id memos carry a 64-bit unsigned integer. Both are passed to
 * the transaction unchanged and default to no memo when omitted.
 */
export type TransactionMemo =
  { type: 'text'; value: string } | { type: 'id'; value: string | number | bigint };

/**
 * Options for changing an operation from outside, e.g. cancelling it when a page
 * unmounts, bumping the fee under load, or previewing a call without sending it.
 */
export interface WriteOptions {
  /** Aborts the wallet prompt, the submission, and the confirmation poll for this call. */
  signal?: AbortSignal;
  /**
   * Base fee for the transaction in stroops, as a decimal integer string.
   * Overrides the client's default write fee. Resource fees discovered by the
   * simulation are still added on top by Soroban assembly.
   */
  fee?: string;
  /** Memo to attach to the transaction. Omit to leave the transaction memo-less. */
  memo?: TransactionMemo;
  /**
   * Simulate and assemble the transaction without signing or submitting it.
   * Resolves with the assembled transaction, its minimum resource fee, the
   * simulated CPU/memory cost, and any authorization entries the call needs.
   */
  simulateOnly?: boolean;
}

/** The result of a submitted write. */
export interface WriteResult {
  /** Hash of the confirmed transaction. */
  hash: string;
}

/** The result of a write call made with `simulateOnly: true`. */
export interface SimulationResult {
  /** The transaction assembled from the simulation, ready to be signed elsewhere. */
  transaction: Transaction;
  /** Minimum resource fee, in stroops, reported by the simulation. */
  minResourceFee: string;
  /** CPU instructions the invocation is expected to consume, as a decimal string. */
  cpuInsns: string;
  /** Memory bytes the invocation is expected to use, as a decimal string. */
  memBytes: string;
  /** Authorization entries discovered by the simulation; may be empty. */
  auth: xdr.SorobanAuthorizationEntry[];
}

/**
 * `simulateOnly: true` changes the return type of a write call; every other
 * call still resolves with the confirmed transaction hash.
 */
export type WriteResultFor<O extends WriteOptions> = O extends { simulateOnly: true }
  ? SimulationResult
  : WriteResult;

/**
 * Options for constructing a {@link StreamsClient}: where the `stream`
 * contract lives, how to reach Soroban RPC, and which account signs writes.
 *
 * Only `contractId`, `rpcUrl` and `networkPassphrase` are required. Reads work
 * with just those three plus a `publicKey`; every write additionally needs
 * `signTransaction`.
 *
 * @example
 * ```typescript
 * import { StreamsClient } from '@stellar-starter-kit/sdk';
 *
 * const client = new StreamsClient({
 *   contractId: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID!,
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: 'Test SDF Network ; September 2015',
 *   publicKey: address,
 *   signTransaction: (txXdr) => wallet.signTransaction(txXdr),
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Simulated locally before a real submit is expensive (e.g. a batch of
 * // `createStream` calls already covered by one simulation): skip it, and
 * // accept that contract errors only surface once the transaction is sent.
 * const fastClient = new StreamsClient({
 *   contractId,
 *   rpcUrl,
 *   networkPassphrase,
 *   publicKey: address,
 *   signTransaction,
 *   skipSimulation: true,
 *   pollIntervalMs: 500,
 *   pollTimeoutMs: 60_000,
 * });
 * ```
 */
export interface StreamsClientOptions {
  /** The deployed contract id (C...): the `stream` contract for `StreamsClient`, the `escrow` contract for `EscrowClient`. */
  contractId: string;
  /**
   * Soroban RPC endpoint, e.g. https://soroban-testnet.stellar.org.
   *
   * Either this or {@link rpcUrls} is required. `rpcUrls` takes precedence
   * when both are given.
   */
  rpcUrl?: string;
  /**
   * Soroban RPC endpoints ordered by preference: the first is the primary and
   * later entries are failover hosts. Transport failures (a network error, a
   * timeout, or a 5xx response) rotate to the next host; application errors
   * such as a failed simulation do not. The last healthy host stays sticky.
   *
   * When set, this takes precedence over {@link rpcUrl}.
   */
  rpcUrls?: string[];
  /** Network passphrase the contract is deployed on. */
  networkPassphrase: string;
  /** Connected account used as the source/simulation account. */
  publicKey?: string;
  /** Signer provided by the wallet layer. Required for state-changing calls. */
  signTransaction?: (
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ) => Promise<string>;
  /**
   * The Soroban RPC calls made by this client. Defaults to a `SorobanRpc.Server`
   * built from the configured URL(s); pass an in-memory fake in tests to run
   * the suite without a network. Pass an array (one per `rpcUrls` entry) or use
   * {@link transportFactory} to exercise failover with fakes.
   */
  transport?: StreamsTransport | StreamsTransport[];
  /**
   * Builds the transport for each configured RPC URL. Defaults to
   * `(url) => new SorobanRpc.Server(url)`; inject one in tests to exercise
   * failover without a network.
   */
  transportFactory?: (rpcUrl: string) => StreamsTransport;
  /** Default signal for write calls. A per-call signal takes precedence over it. */
  signal?: AbortSignal;
  /**
   * Skip the pre-flight simulation write calls run before asking for a
   * signature, e.g. when the same call was just simulated elsewhere. Errors
   * are then only discovered once the transaction is submitted.
   */
  skipSimulation?: boolean;
  /** Base delay between confirmation polls and submission retries. Defaults to 1s. */
  pollIntervalMs?: number;
  /** How long to wait for a submitted transaction to confirm. Defaults to 30s. */
  pollTimeoutMs?: number;
  /**
   * Called after a transport-level failure rotates the client to another RPC
   * host. The rotation is also logged with `console.warn`; use this hook for
   * structured telemetry.
   */
  onRpcFailover?: (event: RpcFailoverEvent) => void;
  /**
   * Sponsor the submission fees of every write with a fee-bump transaction.
   * The connected wallet still signs the inner transaction, so the contract
   * sees the user as the source account; only the fee comes from `feeSource`.
   * Leave this unset to submit the wallet-signed transaction unchanged.
   */
  feeBump?: FeeBumpOptions;
}

/** Details of a {@link StreamsClientOptions.rpcUrls} host rotation. */
export interface RpcFailoverEvent {
  /** Host that failed. */
  from: string;
  /** Host the client will use for subsequent calls. */
  to: string;
  /** The transport error that triggered the rotation. */
  error: unknown;
}

/** Configuration for {@link StreamsClientOptions.feeBump}. */
export interface FeeBumpOptions {
  /** Account that pays the fees, e.g. a faucet or the dashboard's treasury. */
  feeSource: string;
  /** Signer for `feeSource`. Receives the fee-bump envelope, not the inner one. */
  signTransaction: (
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ) => Promise<string>;
  /**
   * Fee the sponsor pays per included operation, in stroops — the same meaning
   * as `TransactionBuilder.buildFeeBumpTransaction`'s second argument. Must be
   * at least the inner transaction's own fee rate. Defaults to that rate, so
   * the sponsor pays the rate the user's transaction already committed to for
   * the inner operations plus the fee-bump envelope itself.
   */
  baseFee?: string | number;
}

/**
 * The Soroban RPC surface the clients call. The default implementation is
 * `SorobanRpc.Server`; tests inject an in-memory fake instead of stubbing the
 * server prototype, so no call can accidentally reach the network.
 */
export interface StreamsTransport {
  getAccount(address: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<SorobanRpc.Api.SimulateTransactionResponse>;
  prepareTransaction(tx: Transaction): Promise<Transaction>;
  sendTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<SorobanRpc.Api.SendTransactionResponse>;
  getTransaction(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse>;
  /** Chain tip, used by `listStreams` to anchor its default ledger window. */
  getLatestLedger(): Promise<SorobanRpc.Api.GetLatestLedgerResponse>;
  /** Contract event scan, the transport `listStreams` pages through. */
  getEvents(request: SorobanRpc.Api.GetEventsRequest): Promise<SorobanRpc.Api.GetEventsResponse>;
}

/**
 * Rotates {@link StreamsTransport} calls across configured RPC endpoints when a
 * host fails at the transport level: a network error, a timeout, or a 5xx
 * response. Application-level failures (contract errors reported by a
 * simulation, a rejected transaction, an aborted call) are rethrown unchanged
 * so they never hide a real problem behind another host.
 *
 * A rotated host stays active until it too fails, which keeps reads on one
 * sticky node instead of round-robining every request.
 */
export class FailoverTransport implements StreamsTransport {
  private index = 0;

  constructor(
    private readonly endpoints: Array<{ url: string; transport: StreamsTransport }>,
    private readonly onRotate?: (event: RpcFailoverEvent) => void,
  ) {
    if (endpoints.length === 0) {
      throw new Error('At least one RPC endpoint is required.');
    }
  }

  /** The URL of the host currently serving requests. */
  get activeUrl(): string {
    return this.endpoints[this.index]!.url;
  }

  /** Every configured URL, in preference order. */
  get urls(): string[] {
    return this.endpoints.map((endpoint) => endpoint.url);
  }

  private async run<T>(call: (transport: StreamsTransport) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.endpoints.length; attempt++) {
      const endpoint = this.endpoints[this.index]!;
      try {
        return await call(endpoint.transport);
      } catch (error) {
        lastError = error;
        if (!isTransportFailure(error) || this.endpoints.length === 1) throw error;
        const from = endpoint.url;
        this.index = (this.index + 1) % this.endpoints.length;
        const to = this.activeUrl;
        console.warn(`[stellar-streams] RPC ${from} failed; failing over to ${to}.`, error);
        this.onRotate?.({ from, to, error });
      }
    }
    throw lastError;
  }

  getAccount(address: string): Promise<Account> {
    return this.run((transport) => transport.getAccount(address));
  }

  simulateTransaction(tx: Transaction): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    return this.run((transport) => transport.simulateTransaction(tx));
  }

  prepareTransaction(tx: Transaction): Promise<Transaction> {
    return this.run((transport) => transport.prepareTransaction(tx));
  }

  sendTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    return this.run((transport) => transport.sendTransaction(tx));
  }

  getTransaction(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse> {
    return this.run((transport) => transport.getTransaction(hash));
  }

  getLatestLedger(): Promise<SorobanRpc.Api.GetLatestLedgerResponse> {
    return this.run((transport) => transport.getLatestLedger());
  }

  getEvents(request: SorobanRpc.Api.GetEventsRequest): Promise<SorobanRpc.Api.GetEventsResponse> {
    return this.run((transport) => transport.getEvents(request));
  }
}

/**
 * Whether an error came from reaching an RPC host rather than from the
 * application response it returned. Both `fetch`/axios and the Stellar SDK
 * report host failures with different shapes, so the classifier accepts the
 * common cases and deliberately leaves everything else untouched.
 */
function isTransportFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'StreamsError') return false;
  const status = httpStatus(error);
  if (status !== undefined) return status >= 500 || status === 408 || status === 429;
  const code = (error as { code?: unknown }).code;
  if (
    typeof code === 'string' &&
    [
      'ECONNABORTED',
      'ECONNREFUSED',
      'ECONNRESET',
      'ENETUNREACH',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_SOCKET',
    ].includes(code)
  ) {
    return true;
  }
  if (['NetworkError', 'TimeoutError', 'FetchError'].includes(error.name)) return true;
  return /failed to fetch|fetch failed|network error|socket hang up|timed? ?out/i.test(
    error.message,
  );
}

/** Extracts an HTTP status from axios-, fetch- and `Response`-shaped errors. */
function httpStatus(error: unknown): number | undefined {
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === 'number') return value;
  }
  return undefined;
}

/**
 * On-chain metadata of a SEP-41 token contract (any SAC or custom Soroban
 * token), as returned by {@link StreamsClient.getTokenMetadata}.
 *
 * Scale and display token amounts with `decimals` from the token itself — only
 * SACs (XLM and issued assets) are guaranteed to use 7.
 *
 * @example
 * ```typescript
 * import { formatTokenAmount } from '@stellar-starter-kit/utils';
 *
 * const meta: TokenMetadata = await client.getTokenMetadata(token);
 * // meta => { contractId: 'C…', decimals: 7, symbol: 'USDC' }
 * const human = formatTokenAmount(stream.claimable, meta.decimals);
 * console.log(`${human} ${meta.symbol}`);
 * ```
 */
export interface TokenMetadata {
  contractId: string;
  /** Decimal places of the smallest unit. Read from the token; never assume 7. */
  decimals: number;
  symbol: string;
}

/**
 * The Stellar Asset Contract id for a classic asset (`'native'` for XLM, or
 * `CODE:ISSUER` / an `Asset`) on the given network. Use it as the `token` of a
 * stream when streaming an issued asset.
 *
 * @param asset - `'native'`, a `CODE:ISSUER` string, or an `Asset` instance
 *   from `@stellar/stellar-sdk`.
 * @param networkPassphrase - Passphrase of the network the asset exists on,
 *   e.g. `'Test SDF Network ; September 2015'`.
 * @returns The SAC contract id (`C...`) for that asset on that network.
 * @throws Error when a string is neither `'native'` nor a `CODE:ISSUER` pair.
 * @example
 * ```typescript
 * import { assetContractId } from '@stellar-starter-kit/sdk';
 *
 * const XLM = assetContractId('native', 'Test SDF Network ; September 2015');
 * const USDC = assetContractId(`USDC:${usdcIssuer}`, 'Test SDF Network ; September 2015');
 * // Pass the result straight to createStream:
 * await client.createStream({ sender, recipient, token: USDC, amount, startTime, endTime, cliffTime });
 * ```
 */
export function assetContractId(
  asset: Asset | 'native' | string,
  networkPassphrase: string,
): string {
  let resolved: Asset;
  if (asset instanceof Asset) {
    resolved = asset;
  } else if (asset === 'native') {
    resolved = Asset.native();
  } else {
    const [code, issuer] = asset.split(':');
    if (!code || !issuer) {
      throw new Error(`Expected an asset as 'native' or 'CODE:ISSUER', got: ${asset}`);
    }
    resolved = new Asset(code, issuer);
  }
  return resolved.contractId(networkPassphrase);
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;
/** Base fee used for write transactions when the caller does not pass `fee`. */
const DEFAULT_WRITE_FEE = '1000000';
/** Upper bound for the exponential backoff applied to `TRY_AGAIN_LATER`. */
const MAX_BACKOFF_MS = 8_000;
/** Must match `MAX_LABEL_LEN` in the stream contract. */
const MAX_LABEL_BYTES = 64;
/** Must match `MAX_REFERENCE_LEN` in the stream contract. */
const MAX_REFERENCE_BYTES = 128;
/** `getStream` calls {@link StreamsClient.listStreams} runs at a time. */
const STREAM_FETCH_CONCURRENCY = 8;

/**
 * `setTimeout` as a promise. When `signal` aborts — before or during the wait —
 * the timer is cleared and the promise rejects with the abort reason, so an
 * aborted call never leaves a pending timer behind.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The abort reason the way `fetch` reports it: the signal's reason, or an `AbortError`. */
function abortReason(signal?: AbortSignal): Error {
  return (
    (signal?.reason as Error | undefined) ??
    new DOMException('This operation was aborted', 'AbortError')
  );
}

/** Throws the abort reason when `signal` has aborted; a no-op otherwise. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal);
}

/** Integer division rounded up, for splitting a total fee across operations. */
function ceilDiv(total: bigint, parts: bigint): bigint {
  return (total + parts - 1n) / parts;
}

/** Raised when the network rejects a submission because its sequence number is stale. */
class StaleSequenceError extends Error {}

/**
 * Stable identifiers for the stream contract's `StreamError` enum, carried on
 * {@link StreamsError.code} so UI code can branch on a name instead of a
 * message. Codes outside this table leave `code` `undefined` and keep the raw
 * diagnostics in `message`.
 *
 * @example
 * ```typescript
 * import { StreamsError, type StreamErrorCode } from '@stellar-starter-kit/sdk';
 *
 * const COPY: Partial<Record<StreamErrorCode, string>> = {
 *   NOTHING_TO_WITHDRAW: 'Nothing has vested yet — check the schedule.',
 *   STREAM_NOT_FOUND: 'This stream no longer exists.',
 *   UNAUTHORIZED: 'Only the recipient can withdraw a stream.',
 * };
 *
 * try {
 *   await client.withdraw(id);
 * } catch (error) {
 *   if (error instanceof StreamsError && error.code) {
 *     console.error(COPY[error.code] ?? error.message);
 *   }
 * }
 * ```
 */
export type StreamErrorCode =
  | 'INVALID_AMOUNT'
  | 'INVALID_TIME_RANGE'
  | 'INVALID_CLIFF'
  | 'STREAM_NOT_FOUND'
  | 'NOTHING_TO_WITHDRAW'
  | 'UNAUTHORIZED'
  | 'INVALID_FEE'
  | 'ALREADY_CANCELLED'
  | 'ALREADY_INITIALIZED'
  | 'TREASURY_NOT_SET'
  | 'METADATA_TOO_LONG'
  | 'INVALID_START_TIME'
  | 'EMPTY_BATCH'
  | 'BATCH_TOO_LARGE'
  | 'BATCH_OVERFLOW'
  | 'SAME_RECIPIENT';

/**
 * Stable identifiers for the splits contract's `SplitError` enum. They share
 * the numeric-code space of the `splits` contract, so they are listed
 * separately from {@link StreamErrorCode}; the SDK currently maps stream
 * contract failures onto {@link StreamsError.code}, and these names are what a
 * caller should compare decoded `splits` diagnostics against.
 *
 * @example
 * ```typescript
 * import type { SplitErrorCode } from '@stellar-starter-kit/sdk';
 *
 * const isRecipientsProblem = (code: SplitErrorCode) =>
 *   code === 'EmptyRecipients' || code === 'LengthMismatch' || code === 'DuplicateRecipient';
 * ```
 */
export type SplitErrorCode =
  | 'EmptyRecipients'
  | 'LengthMismatch'
  | 'InvalidShares'
  | 'InvalidAmount'
  | 'DuplicateRecipient'
  | 'SplitNotFound'
  | 'Unauthorized'
  | 'ShareOverflow';
/**
 * The one place the stream contract's numeric codes are named. Must stay in
 * sync with the `StreamError` enum in `contracts/stream/src/lib.rs`; codes
 * outside this table fall back to the raw error message instead of failing the
 * mapping.
 */
const STREAM_ERROR_CODES: Record<number, StreamErrorCode> = {
  1: 'INVALID_AMOUNT',
  2: 'INVALID_TIME_RANGE',
  3: 'INVALID_CLIFF',
  4: 'STREAM_NOT_FOUND',
  5: 'NOTHING_TO_WITHDRAW',
  6: 'UNAUTHORIZED',
  7: 'INVALID_FEE',
  8: 'ALREADY_CANCELLED',
  9: 'ALREADY_INITIALIZED',
  10: 'TREASURY_NOT_SET',
  11: 'METADATA_TOO_LONG',
  12: 'INVALID_START_TIME',
  13: 'EMPTY_BATCH',
  14: 'BATCH_TOO_LARGE',
  15: 'BATCH_OVERFLOW',
  20: 'SAME_RECIPIENT',
};

/**
 * Raised when a call fails with one of the stream contract's own errors, e.g.
 * withdrawing from a stream with nothing vested. `code` is a stable identifier
 * that survives contract redeploys; `contractCode` is the raw numeric code.
 * Both are undefined when the failure is not a known contract error, in which
 * case `message` carries the raw diagnostics.
 *
 * Thrown by every {@link StreamsClient} method that reaches the contract:
 * reads from the pre-flight simulation, writes from the simulation *and* from
 * submission / confirmation polling.
 *
 * @example
 * ```typescript
 * import { StreamsError } from '@stellar-starter-kit/sdk';
 *
 * try {
 *   await client.withdraw(streamId);
 * } catch (error) {
 *   if (error instanceof StreamsError) {
 *     error.name;          // 'StreamsError'
 *     error.code;          // e.g. 'NOTHING_TO_WITHDRAW', or undefined
 *     error.contractCode;  // e.g. 5 — the raw `StreamError` enum value
 *     error.message;       // includes the contract diagnostics
 *   }
 * }
 * ```
 */
export class StreamsError extends Error {
  /** Stable identifier for the contract error, e.g. `STREAM_NOT_FOUND`. */
  readonly code?: StreamErrorCode;
  /** The raw numeric code from the contract's `StreamError` enum. */
  readonly contractCode?: number;

  /**
   * @param message - Human-readable failure text, always including the raw
   *   simulation or submission diagnostics.
   * @param contractCode - Numeric `StreamError` value decoded from those
   *   diagnostics; omit it when the failure is not a contract error.
   * @example
   * ```typescript
   * const known = new StreamsError('Simulation of withdraw failed: Error(Contract, #5)', 5);
   * known.code; // 'NOTHING_TO_WITHDRAW'
   * const unknown = new StreamsError('Simulation of get_stream failed: HostError(sceBuiltin)');
   * unknown.code; // undefined — the message stays untouched
   * ```
   */
  constructor(message: string, contractCode?: number) {
    super(message);
    this.name = 'StreamsError';
    this.contractCode = contractCode;
    this.code = contractCode === undefined ? undefined : STREAM_ERROR_CODES[contractCode];
  }
}

/** Stable identifiers for the escrow contract's `EscrowError` enum. */
export type EscrowErrorCode =
  | 'ESCROW_NOT_FOUND'
  | 'ESCROW_ALREADY_EXISTS'
  | 'INVALID_AMOUNT'
  | 'UNAUTHORIZED_OPERATION'
  | 'INVALID_STATE_TRANSITION'
  | 'DEADLINE_NOT_REACHED'
  | 'DEADLINE_EXPIRED'
  | 'ALREADY_FINALIZED';

/** Events requested per `getEvents` call when {@link StreamsClient.listStreams} pages. */
export const DEFAULT_EVENT_PAGE_SIZE = 100;

/**
 * Ledgers scanned by {@link StreamsClient.listStreams} when no `startLedger` is
 * given: 1000 ledgers is roughly two hours of slots and stays inside the event
 * window a public Soroban RPC node retains. Pass an explicit range to look
 * further back.
 */
export const DEFAULT_EVENT_LOOKBACK_LEDGERS = 1000;

/** `getEvents` topic matcher for "any ScVal at this position". */
const ANY_TOPIC = '*';

/**
 * Arguments for {@link StreamsClient.listStreams}.
 */
export interface ListStreamsOptions {
  /** Address to find streams for, as either the sender or the recipient. */
  address: string;
  /**
   * Opaque paging token returned by a previous `listStreams` call. When set,
   * the scan resumes immediately after that token and `startLedger`/`endLedger`
   * must be omitted (the RPC API rejects mixing a cursor with a ledger range).
   */
  cursor?: string;
  /**
   * First ledger to scan, inclusive. Defaults to
   * `latestLedger - maxLedgers`, read from the RPC node.
   * Must be within the node's event retention window; earlier ledgers are not
   * recoverable from `getEvents` and need an indexer.
   */
  startLedger?: number;
  /**
   * Last ledger to scan, inclusive. Defaults to the chain tip when the scan
   * starts, so concurrent creations are not picked up mid-call.
   */
  endLedger?: number;
  /**
   * Events per RPC page. Defaults to {@link DEFAULT_EVENT_PAGE_SIZE}. Lower it
   * if the node rejects the request or the payloads are large.
   */
  pageSize?: number;
  /**
   * Maximum ledger span a single call will scan before returning its cursor.
   * Defaults to {@link DEFAULT_EVENT_LOOKBACK_LEDGERS}. A page that crosses the
   * boundary is returned whole, so the next call resumes without a gap.
   */
  maxLedgers?: number;
  /** Aborts the scan between RPC pages. */
  signal?: AbortSignal;
}

/** The page returned by {@link StreamsClient.listStreams}. */
export interface ListStreamsResult {
  /** Streams matching the address and cursor window, oldest first. */
  streams: Stream[];
  /** Opaque paging token to pass as `cursor` on the next call. */
  cursor: string;
}

/**
 * Raised when a `listStreams` cursor is not a paging token returned by the
 * RPC API. Cursors are opaque, so a value from another network or a truncated
 * token fails before any RPC request is made.
 */
export class InvalidCursorError extends Error {
  /** The rejected cursor. */
  readonly cursor: string;

  constructor(cursor: string) {
    super(
      `Invalid cursor: ${cursor}. Expected the opaque paging token returned by a previous listStreams call.`,
    );
    this.name = 'InvalidCursorError';
    this.cursor = cursor;
  }
}

/**
 * The one place the escrow contract's numeric codes are named. Must stay in
 * sync with the `EscrowError` enum in `contracts/escrow/src/lib.rs`.
 */
const ESCROW_ERROR_CODES: Record<number, EscrowErrorCode> = {
  1: 'ESCROW_NOT_FOUND',
  2: 'ESCROW_ALREADY_EXISTS',
  3: 'INVALID_AMOUNT',
  4: 'UNAUTHORIZED_OPERATION',
  5: 'INVALID_STATE_TRANSITION',
  6: 'DEADLINE_NOT_REACHED',
  7: 'DEADLINE_EXPIRED',
  8: 'ALREADY_FINALIZED',
};

/** The escrow counterpart of `StreamsError`; raised for `EscrowClient` failures. */
export class EscrowError extends Error {
  /** Stable identifier for the escrow contract error, e.g. `ESCROW_NOT_FOUND`. */
  readonly code?: EscrowErrorCode;
  /** The raw numeric code from the contract's `EscrowError` enum. */
  readonly contractCode?: number;

  constructor(message: string, contractCode?: number) {
    super(message);
    this.name = 'EscrowError';
    this.contractCode = contractCode;
    this.code = contractCode === undefined ? undefined : ESCROW_ERROR_CODES[contractCode];
  }
}

/**
 * Shared machinery for the SDK's contract clients: caches the source account,
 * simulates read calls, and runs the pre-flight/sign/submit/poll pipeline for
 * write calls. Subclasses name the contract's error codes and add the methods.
 */
abstract class SorobanClient {
  protected readonly transport: StreamsTransport;
  private readonly rpc: FailoverTransport;
  private readonly options: StreamsClientOptions;
  /**
   * The source account (and its sequence number), fetched once and shared by
   * every simulate/invoke call. Cached as a promise so concurrent reads — e.g.
   * `getStream` and `claimable` issued together — share one `getAccount`.
   */
  private account: Promise<Account> | null = null;

  /**
   * @param options - Endpoint, contract id, network and (for writes) the
   *   connected account plus its signer. See {@link StreamsClientOptions}.
   * @example
   * ```typescript
   * // Read-only client: safe to construct during SSR without a wallet.
   * const publicClient = new StreamsClient({
   *   contractId,
   *   rpcUrl: 'https://soroban-testnet.stellar.org',
   *   networkPassphrase: 'Test SDF Network ; September 2015',
   *   publicKey: serviceAccountPublicKey,
   * });
   * await publicClient.getConfig();
   * ```
   */
  constructor(options: StreamsClientOptions) {
    this.options = options;
    const urls = configuredRpcUrls(options);
    if (options.transport instanceof FailoverTransport) {
      this.rpc = options.transport;
    } else if (Array.isArray(options.transport)) {
      if (options.transport.length === 0) {
        throw new Error('Pass at least one injected transport, or leave `transport` unset.');
      }
      this.rpc = new FailoverTransport(
        options.transport.map((transport, index) => ({
          url: urls[index] ?? `injected transport ${index + 1}`,
          transport,
        })),
        options.onRpcFailover,
      );
    } else if (options.transport) {
      const url = urls[0] ?? 'injected transport';
      this.rpc = new FailoverTransport(
        [{ url, transport: options.transport }],
        options.onRpcFailover,
      );
    } else {
      if (urls.length === 0) {
        throw new Error('Configure at least one RPC endpoint with `rpcUrl` or `rpcUrls`.');
      }
      const create =
        options.transportFactory ??
        ((url: string) => new SorobanRpc.Server(url) as StreamsTransport);
      this.rpc = new FailoverTransport(
        urls.map((url) => ({ url, transport: create(url) })),
        options.onRpcFailover,
      );
    }
    this.transport = this.rpc;
  }

  /** The RPC host currently serving requests, useful when diagnosing latency. */
  get activeRpcUrl(): string {
    return this.rpc.activeUrl;
  }

  /** Every configured RPC URL, in preference order. */
  get rpcUrls(): string[] {
    return this.rpc.urls;
  }

  /** Numeric contract codes the subclass knows, keyed by their stable names. */
  protected abstract readonly errorCodes: Record<number, string>;

  /** Builds the subclass's error type for a contract failure. */
  protected abstract newContractError(message: string, contractCode: number | undefined): Error;

  /** Builds the contract handle on demand (kept lazy so the client can be
   * constructed before a contract id is configured, e.g. during SSR). */
  protected get contract(): Contract {
    if (!this.options.contractId) {
      throw new Error('No contract id configured.');
    }
    return new Contract(this.options.contractId);
  }

  /** The connected wallet's address, for calls that pass it as an argument. */
  protected get publicKey(): string | undefined {
    return this.options.publicKey;
  }

  /**
   * The configured contract id.
   *
   * @returns The `stream` contract id (`C...`) the client was constructed with.
   * @example
   * ```typescript
   * if (client.contractId !== expectedContractId) {
   *   throw new Error('Client is pointed at the wrong deployment.');
   * }
   * ```
   */
  get contractId(): string {
    return this.options.contractId;
  }

  /**
   * Returns a fresh copy of the cached source account, fetching it on first
   * use. A copy is handed out because `TransactionBuilder.build()` increments
   * the sequence number of the account it is given, and simulations must not
   * advance the cached sequence.
   */
  private async sourceAccount(): Promise<Account> {
    const { publicKey } = this.options;
    if (!publicKey) {
      throw new Error('A connected wallet (publicKey) is required for this operation.');
    }
    if (!this.account) {
      const pending = this.transport.getAccount(publicKey);
      this.account = pending;
      // Don't cache failures; the next call should retry the fetch.
      pending.catch(() => {
        if (this.account === pending) this.account = null;
      });
    }
    const cached = await this.account;
    return new Account(cached.accountId(), cached.sequenceNumber());
  }

  /**
   * Drops the cached source account so the next call re-fetches it. Called
   * automatically after every submitted write (its sequence number has been
   * consumed); call it yourself if the account is used from elsewhere.
   *
   * @returns Nothing.
   * @example
   * ```typescript
   * // The source account also transacts outside this client, so its cached
   * // sequence number may be stale before the next write.
   * client.invalidateAccount();
   * await client.withdraw(streamId);
   * ```
   */
  invalidateAccount(): void {
    this.account = null;
  }

  /** Simulates a read-only call on the client's contract and returns the decoded result. */
  protected simulate(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
    return this.simulateOn(this.contract, method, ...args);
  }

  /** Simulates a read-only call on any contract and returns the decoded result. */
  protected async simulateOn(
    contract: Contract,
    method: string,
    ...args: xdr.ScVal[]
  ): Promise<unknown> {
    const account = await this.sourceAccount();
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.options.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const response = await this.transport.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(response)) {
      throw this.simulationFailure(method, response.error);
    }
    const retval = response.result?.retval;
    if (!retval) {
      throw new Error(`Simulation of ${method} returned no value.`);
    }
    return scValToNative(retval);
  }

  /** Builds, signs, submits and confirms a state-changing contract call. */
  protected async invoke<O extends WriteOptions>(
    method: string,
    args: xdr.ScVal[],
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    const { publicKey, signTransaction, networkPassphrase } = this.options;
    if (!publicKey) {
      throw new Error('A connected wallet (publicKey) is required for this operation.');
    }
    if (!opts.simulateOnly && !signTransaction) {
      throw new Error('A connected wallet is required to submit transactions.');
    }
    const signal = opts.signal ?? this.options.signal;
    const fee = opts.fee === undefined ? DEFAULT_WRITE_FEE : validateFee(opts.fee);
    const memo = opts.memo === undefined ? undefined : toMemo(opts.memo);

    // A cached sequence can go stale if the account transacted elsewhere; in
    // that case re-fetch it once and rebuild instead of failing the call.
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      const account = await this.sourceAccount();
      throwIfAborted(signal);
      const builder = new TransactionBuilder(account, {
        fee,
        networkPassphrase,
      })
        .addOperation(this.contract.call(method, ...args))
        .setTimeout(30);
      if (memo) builder.addMemo(memo);
      const tx = builder.build();

      // Simulate before preparing so a call that cannot succeed fails with the
      // contract's own error instead of an opaque failure mid-assembly — and
      // without opening a wallet prompt for a doomed transaction. A dry run
      // always simulates, because that simulation *is* the result.
      let simulated: SorobanRpc.Api.SimulateTransactionResponse | undefined;
      if (opts.simulateOnly || !this.options.skipSimulation) {
        simulated = await this.transport.simulateTransaction(tx);
        throwIfAborted(signal);
        if (SorobanRpc.Api.isSimulationError(simulated)) {
          throw this.simulationFailure(method, simulated.error);
        }
      }

      if (opts.simulateOnly) {
        return this.dryRun(
          tx,
          simulated as SorobanRpc.Api.SimulateTransactionSuccessResponse,
        ) as WriteResultFor<O>;
      }

      throwIfAborted(signal);
      const prepared = await this.transport.prepareTransaction(tx);
      // Never open a wallet prompt for a call the caller already cancelled.
      throwIfAborted(signal);
      const signedXdr = await signTransaction!(prepared.toXDR(), {
        networkPassphrase,
        address: publicKey,
      });
      throwIfAborted(signal);

      const inner = TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction;

      let hash: string;
      try {
        hash = await this.submit(this.options.feeBump ? await this.bumpFees(inner) : inner, signal);
      } catch (error) {
        this.invalidateAccount();
        if (error instanceof StaleSequenceError && attempt === 0) continue;
        throw error;
      }
      // Invalidation point: once the network has accepted the transaction its
      // sequence number is consumed (whether it later succeeds or fails).
      this.invalidateAccount();
      return this.poll(hash, signal) as unknown as WriteResultFor<O>;
    }
  }

  /**
   * Assembles a simulated transaction without signing or submitting it, and
   * reports the resource estimates callers use to budget a write.
   */
  private dryRun(
    tx: Transaction,
    simulated: SorobanRpc.Api.SimulateTransactionSuccessResponse,
  ): SimulationResult {
    const assembled = SorobanRpc.assembleTransaction(tx, simulated).build();
    const resources = simulated.transactionData?.build().resources();
    return {
      transaction: assembled,
      minResourceFee: simulated.minResourceFee ?? '0',
      cpuInsns: resources ? resources.instructions().toString() : '0',
      // Soroban charges for both reading ledger entries and writing them back.
      memBytes: resources ? (resources.diskReadBytes() + resources.writeBytes()).toString() : '0',
      auth: simulated.result?.auth ?? [],
    };
  }

  /**
   * Wraps a wallet-signed inner transaction in a fee-bump transaction signed by
   * the configured sponsor. The inner transaction keeps the user as its source
   * account and signature, so the contract still attributes the call to them;
   * the sponsor only adds an envelope that pays the fee.
   *
   * @throws StreamsError when the sponsor's signer returns something other than
   * a signed fee-bump envelope.
   */
  private async bumpFees(inner: Transaction): Promise<FeeBumpTransaction> {
    const { feeBump } = this.options;
    if (!feeBump) {
      throw new Error('bumpFees called without a feeBump hook.');
    }
    const { networkPassphrase } = this.options;
    const { feeSource, signTransaction, baseFee } = feeBump;
    // `buildFeeBumpTransaction` rejects a rate below the inner transaction's
    // own, so borrowing that rate is both the cheapest and the always-valid
    // default: the sponsor pays it once per inner operation and once for the
    // fee-bump envelope itself.
    const rate =
      baseFee === undefined
        ? ceilDiv(BigInt(inner.fee), BigInt(inner.operations.length)).toString()
        : String(baseFee);

    const unsigned = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      rate,
      inner,
      networkPassphrase,
    );
    const signedXdr = await signTransaction(unsigned.toXDR(), {
      networkPassphrase,
      address: feeSource,
    });
    const signed = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    if (!(signed instanceof FeeBumpTransaction)) {
      throw new StreamsError(
        `feeBump.signTransaction for ${feeSource} must return the signed fee-bump envelope it was given.`,
      );
    }
    return signed;
  }

  private get pollIntervalMs(): number {
    return this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  private get pollTimeoutMs(): number {
    return this.options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  }

  /**
   * Submits a signed transaction. `TRY_AGAIN_LATER` means the RPC node queued
   * nothing (e.g. its mempool is full), so the same envelope is resent with
   * exponential backoff instead of surfacing an error to the user.
   */
  private async submit(
    tx: Transaction | FeeBumpTransaction,
    signal?: AbortSignal,
  ): Promise<string> {
    const startedAt = Date.now();
    let delay = this.pollIntervalMs;
    for (;;) {
      throwIfAborted(signal);
      const submitted = await this.transport.sendTransaction(tx);
      if (submitted.status === 'ERROR') {
        if (innermostResult(submitted.errorResult?.result())?.switch().name === 'txBadSeq') {
          throw new StaleSequenceError(
            `Transaction ${submitted.hash} used a stale sequence number.`,
          );
        }
        throw this.newContractError(
          `Transaction ${submitted.hash} was rejected: ${describeTransactionResult(submitted.errorResult)}` +
            describeDiagnostics(submitted.diagnosticEvents),
          contractErrorCodeFromEvents(submitted.diagnosticEvents),
        );
      }
      if (submitted.status !== 'TRY_AGAIN_LATER') {
        // PENDING or DUPLICATE: the transaction is in flight; confirm it by polling.
        return submitted.hash;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed + delay > this.pollTimeoutMs) {
        throw new Error(
          `RPC kept answering TRY_AGAIN_LATER for transaction ${submitted.hash} after ${formatElapsed(elapsed)}.`,
        );
      }
      await sleep(delay, signal);
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
  }

  /** Polls `getTransaction` until the transaction succeeds, fails, or times out. */
  private async poll(hash: string, signal?: AbortSignal): Promise<{ hash: string }> {
    const startedAt = Date.now();
    for (;;) {
      throwIfAborted(signal);
      const result = await this.transport.getTransaction(hash);
      if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash };
      }
      if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(
          `Transaction ${hash} failed: ${describeTransactionResult(result.resultXdr)}` +
            describeDiagnostics(result.diagnosticEventsXdr),
        );
      }
      // NOT_FOUND: not yet included in a ledger.
      const elapsed = Date.now() - startedAt;
      if (elapsed + this.pollIntervalMs > this.pollTimeoutMs) {
        throw new Error(
          `Timed out waiting for transaction ${hash} after ${formatElapsed(elapsed)}; it may still land, check the hash on an explorer.`,
        );
      }
      await sleep(this.pollIntervalMs, signal);
    }
  }

  /**
   * A subclass error for a failed simulation. Known contract codes are named in
   * the message; unknown ones keep the raw error text untouched.
   */
  private simulationFailure(method: string, error: string): Error {
    const contractCode = contractErrorCode(error);
    const code = contractCode === undefined ? undefined : this.errorCodes[contractCode];
    if (code === undefined) {
      return this.newContractError(`Simulation of ${method} failed: ${error}`, contractCode);
    }
    return this.newContractError(
      `Simulation of ${method} failed: ${code} (contract error #${contractCode}) — ${error}`,
      contractCode,
    );
  }
}

/**
 * A typed client for the Stellar Streams protocol. Read calls simulate against
 * Soroban RPC. Write calls are simulated first — aborting with a readable
 * {@link StreamsError} before any wallet prompt when the contract would reject
 * them — then prepared, signed by the injected wallet signer, submitted, and
 * polled to completion. Write calls accept an `AbortSignal` that cancels the
 * wallet prompt, the submission and the confirmation poll.
 *
 * One client per (contract, network) pair is enough: the source account and
 * each token's metadata are cached on the instance, and concurrent reads share
 * a single `getAccount` round trip.
 * @example
 * ```typescript
 * import { StreamsClient, assetContractId } from '@stellar-starter-kit/sdk';
 *
 * const client = new StreamsClient({
 *   contractId: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID!,
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: 'Test SDF Network ; September 2015',
 *   publicKey: address,
 *   signTransaction: (txXdr) => wallet.signTransaction(txXdr),
 * });
 *
 * const stream = await client.getStream(1n);
 * const claimable = stream ? await client.claimable(stream.id) : 0n;
 * ```
 */
export class StreamsClient extends SorobanClient {
  protected readonly errorCodes = STREAM_ERROR_CODES;

  protected newContractError(message: string, contractCode: number | undefined): Error {
    return new StreamsError(message, contractCode);
  }

  /** Token metadata never changes for a deployed contract, so cache it per id. */
  private readonly tokens = new Map<string, Promise<TokenMetadata>>();

  /**
   * Fetch a stream by id, decoded from the contract's `Stream` struct into the
   * camelCase `Stream` shape (`u64`/`i128` fields arrive as decimal strings).
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @returns The stream, or `null` when no stream with that id exists.
   * @throws StreamsError when the simulation fails with a contract error.
   * @example
   * ```typescript
   * const stream = await client.getStream(12);
   * if (stream) {
   *   console.log(stream.recipient, stream.totalAmount, stream.cancelled);
   * }
   * ```
   */
  async getStream(id: bigint | number | string): Promise<Stream | null> {
    const raw = await this.simulate('get_stream', nativeToScVal(BigInt(id), { type: 'u64' }));
    return raw === null ? null : normalizeStream(raw);
  }

  /**
   * Fetch protocol configuration: who can set the treasury and the protocol fee.
   *
   * @returns The admin, treasury and `feeBps`, or `null` when the contract has
   *   not been initialized yet.
   * @throws StreamsError when the simulation fails with a contract error.
   * @example
   * ```typescript
   * const config = await client.getConfig();
   * if (!config) console.warn('Deploy the contract, then call initialize().');
   * else console.log(`Fee: ${config.feeBps / 100}% (admin ${config.admin})`);
   * ```
   */
  async getConfig(): Promise<StreamConfig | null> {
    const raw = await this.simulate('get_config');
    if (raw === null) return null;
    return normalizeConfig(raw);
  }

  /**
   * Currently withdrawable amount for a stream, in the token's smallest unit.
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @returns Vested-but-unclaimed amount; `0n` before the cliff or once
   *   everything has been withdrawn.
   * @throws StreamsError when the simulation fails with a contract error, e.g.
   *   `STREAM_NOT_FOUND` (contract error `#4`) for an unknown id.
   * @example
   * ```typescript
   * import { formatTokenAmount } from '@stellar-starter-kit/utils';
   *
   * const { decimals } = await client.getTokenMetadata(stream.token);
   * const claimable = await client.claimable(stream.id);
   * console.log(`${formatTokenAmount(claimable, decimals)} withdrawable now`);
   * ```
   */
  async claimable(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('claimable', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /**
   * Total amount vested so far, in the token's smallest unit — including what
   * has already been withdrawn.
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @returns Vested amount; equals the total once `endTime` has passed.
   * @throws StreamsError when the simulation fails with a contract error, e.g.
   *   `STREAM_NOT_FOUND` (contract error `#4`) for an unknown id.
   * @example
   * ```typescript
   * const vested = await client.vested(stream.id);
   * const progress = Number(vested) / Number(stream.totalAmount); // 0…1
   * ```
   */
  async vested(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('vested', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /**
   * The id the next stream will receive.
   *
   * @returns The pending stream id, starting at `1n` on a fresh deployment.
   * @throws StreamsError when the simulation fails with a contract error.
   * @example
   * ```typescript
   * const nextId = await client.nextStreamId();
   * const { hash } = await client.createStream(params);
   * // `nextId` is the id this write consumed, so the stream can be read back:
   * const created = await client.getStream(nextId);
   * ```
   */
  async nextStreamId(): Promise<bigint> {
    return (await this.simulate('next_stream_id')) as bigint;
  }

  /**
   * Find the streams involving an address by scanning the contract's
   * `("stream", "created", id)` events and loading each match with
   * {@link StreamsClient.getStream}.
   *
   * This is a stopgap until a real indexer exists: `getEvents` only serves a
   * node's retained event window (about 1000 ledgers on the public endpoints),
   * so `startLedger` has to fall inside it, and an empty result means "nothing
   * created in the scanned range" rather than "no streams".
   *
   * @param options - the address to search for, as sender or recipient, plus
   * the ledger window, page size and optional resume cursor.
   * @returns `{ streams, cursor }`: the matching streams ordered by the ledger
   * their `created` event landed in (oldest first), and the opaque paging token
   * to pass back as `cursor` for the next incremental scan. Streams whose
   * storage entry has been archived are skipped.
   * @throws Error when `address` is not a Stellar address or the ledger range
   * is empty or unusable, or when a cursor is mixed with a ledger range.
   * @throws InvalidCursorError when `cursor` is not an RPC paging token.
   * @throws StreamsError when a `getStream` lookup for a matched event fails.
   */
  async listStreams(options: ListStreamsOptions): Promise<ListStreamsResult> {
    const { address, cursor } = options;
    assertStreamAddress(address);
    const pageSize = options.pageSize ?? DEFAULT_EVENT_PAGE_SIZE;
    if (pageSize < 1) {
      throw new Error(`pageSize must be at least 1, got: ${pageSize}.`);
    }
    const maxLedgers = options.maxLedgers ?? DEFAULT_EVENT_LOOKBACK_LEDGERS;
    if (!Number.isInteger(maxLedgers) || maxLedgers < 1) {
      throw new Error(`maxLedgers must be a positive integer, got: ${maxLedgers}.`);
    }
    if (cursor !== undefined) {
      assertCursor(cursor);
      if (options.startLedger !== undefined || options.endLedger !== undefined) {
        throw new Error('cursor cannot be combined with startLedger or endLedger.');
      }
    }
    const signal = options.signal;

    let startLedger = options.startLedger;
    let endLedger = options.endLedger;
    if (cursor === undefined && startLedger === undefined) {
      // Anchor the default window on the node's own tip: that is the only
      // reference guaranteed to keep the scan inside its event retention.
      const { sequence } = await this.transport.getLatestLedger();
      startLedger = Math.max(1, sequence - maxLedgers);
      if (endLedger === undefined) endLedger = sequence;
    }
    if (startLedger !== undefined && endLedger !== undefined && endLedger < startLedger) {
      throw new Error(`endLedger ${endLedger} precedes startLedger ${startLedger}.`);
    }

    const filters = [
      {
        type: 'contract' as const,
        contractIds: [this.contract.contractId()],
        topics: [[topicSymbol('stream'), topicSymbol('created'), ANY_TOPIC]],
      },
    ];

    const ids: bigint[] = [];
    const seen = new Set<string>();
    let nextCursor = cursor ?? '';
    let page: SorobanRpc.Api.GetEventsResponse;

    if (cursor !== undefined) {
      // Soroban RPC rejects a getEvents request that mixes a cursor with a
      // ledger range, so bound the window on this side of the wire.
      page = await this.transport.getEvents({ filters, cursor, limit: pageSize });
      throwIfAborted(signal);
      if (endLedger === undefined) {
        const from = cursorLedger(cursor);
        endLedger = Math.min(page.latestLedger, from + maxLedgers);
      }
    } else {
      page = await this.transport.getEvents({
        filters,
        startLedger: startLedger!,
        ...(endLedger === undefined ? {} : { endLedger }),
        limit: pageSize,
      });
      throwIfAborted(signal);
      // Freeze the tip at the first response so streams created while this call
      // runs cannot appear on a later page and shift the end from under it.
      if (endLedger === undefined) {
        endLedger = Math.min(page.latestLedger, startLedger! + maxLedgers);
      }
    }

    for (;;) {
      throwIfAborted(signal);
      if (cursor !== undefined) {
        // A cursor scan takes each page whole: returning a mid-page cursor
        // would re-fetch the same events forever. The window may overshoot by
        // at most one page, and the returned cursor always makes progress.
        for (const event of page.events) {
          if (event.id) nextCursor = event.id;
          collectStreamId(event, address, undefined, ids, seen);
        }
        const lastLedger = page.events.at(-1)?.ledger;
        if (lastLedger !== undefined && endLedger !== undefined && lastLedger >= endLedger) break;
        if (page.events.length === 0 || !page.cursor) {
          if (page.cursor) nextCursor = page.cursor;
          break;
        }
        nextCursor = page.cursor;
        page = await this.transport.getEvents({ filters, cursor: page.cursor, limit: pageSize });
        throwIfAborted(signal);
        continue;
      }

      let reachedEnd = false;
      for (const event of page.events) {
        if (endLedger !== undefined && event.ledger > endLedger) {
          reachedEnd = true;
          break;
        }
        // Advancing by event id keeps the cursor at the last event this window
        // consumed, so resuming cannot skip anything the page also carried.
        if (event.id) nextCursor = event.id;
        collectStreamId(event, address, endLedger, ids, seen);
      }
      if (reachedEnd) break;
      if (page.events.length === 0 || !page.cursor) {
        if (page.cursor) nextCursor = page.cursor;
        break;
      }
      nextCursor = page.cursor;
      page = await this.transport.getEvents({ filters, cursor: page.cursor, limit: pageSize });
      throwIfAborted(signal);
    }

    const streams: Stream[] = [];
    for (let i = 0; i < ids.length; i += STREAM_FETCH_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + STREAM_FETCH_CONCURRENCY).map((id) => this.getStream(id)),
      );
      streams.push(...batch.filter((stream): stream is Stream => stream !== null));
    }
    return { streams, cursor: nextCursor };
  }

  /**
   * Reads `decimals` and `symbol` from a token contract. Works for any SEP-41
   * token: the native XLM SAC, an issued asset's SAC (see {@link assetContractId}),
   * or a custom Soroban token. Results are cached per contract id.
   *
   * @param tokenId - Token contract id (`C...`).
   * @returns The token's `contractId`, `decimals` and `symbol`.
   * @throws Error when `tokenId` is not a valid `C...` contract address —
   *   before any network call.
   * @throws StreamsError when the token does not implement SEP-41 `decimals`
   *   or `symbol`.
   * @example
   * ```typescript
   * import { parseTokenAmount } from '@stellar-starter-kit/utils';
   *
   * const token = assetContractId('native', 'Test SDF Network ; September 2015');
   * const { decimals, symbol } = await client.getTokenMetadata(token); // 7, 'XLM'
   * const amount = parseTokenAmount('100', decimals).toString();       // '1000000000'
   * ```
   */
  async getTokenMetadata(tokenId: string): Promise<TokenMetadata> {
    assertTokenId(tokenId);
    let pending = this.tokens.get(tokenId);
    if (!pending) {
      const token = new Contract(tokenId);
      pending = Promise.all([
        this.simulateOn(token, 'decimals'),
        this.simulateOn(token, 'symbol'),
      ]).then(([decimals, symbol]) => ({
        contractId: tokenId,
        decimals: Number(decimals),
        symbol: String(symbol),
      }));
      this.tokens.set(tokenId, pending);
      pending.catch(() => this.tokens.delete(tokenId));
    }
    return pending;
  }

  /**
   * Lock tokens and open a new stream. `params.token` may be any token
   * contract id; `params.amount` is in that token's smallest unit, so scale it
   * by the token's own `decimals` (see {@link getTokenMetadata}), not by 7.
   *
   * Inputs are validated before the transaction is built: an invalid address,
   * a non-positive amount, an inconsistent schedule or oversized metadata
   * throws a field-named error without spending a network round trip or a
   * wallet signature. `params.label` and `params.reference` default to no
   * metadata (empty strings).
   *
   * @param params - Sender, recipient, token, amount in the token's smallest
   *   unit, the `startTime`/`endTime`/`cliffTime` schedule (Unix seconds), and
   *   optional `label` (64 bytes) / `reference` (128 bytes) metadata.
   * @returns The hash of the confirmed transaction; resolve the new stream id
   *   with {@link nextStreamId} before the call or by reading events after it.
   * @throws Error when a field is invalid — `sender`/`recipient` are not
   *   `G...`/`C...` addresses, `token` is not a `C...` address, `amount` is not
   *   a positive decimal integer string, `endTime <= startTime`, `cliffTime` is
   *   outside the schedule, or the metadata is too long.
   * @throws Error when no `publicKey` / `signTransaction` was configured.
   * @throws StreamsError when the pre-flight simulation or the submitted
   *   transaction is rejected by the contract — e.g. `INVALID_AMOUNT`,
   *   `INVALID_TIME_RANGE`, `INVALID_CLIFF` or `METADATA_TOO_LONG`. The whole
   *   `amount` is pulled from `sender` with the token's own `transfer`, so a
   *   token that refuses the move fails the call too.
   * @example
   * ```typescript
   * import { assetContractId } from '@stellar-starter-kit/sdk';
   * import { parseTokenAmount } from '@stellar-starter-kit/utils';
   *
   * const now = Math.floor(Date.now() / 1_000);
   * const token = assetContractId('native', 'Test SDF Network ; September 2015');
   * const { decimals } = await client.getTokenMetadata(token);
   *
   * // 100 XLM vesting linearly over 30 days, no cliff.
   * const { hash } = await client.createStream({
   *   sender: address,
   *   recipient,
   *   token,
   *   amount: parseTokenAmount('100', decimals).toString(),
   *   startTime: now,
   *   endTime: now + 30 * 86_400,
   *   cliffTime: now,
   *   label: 'Payroll Q3',
   *   reference: 'INV-2026-07',
   * });
   * console.log(`stream funded in ${hash}`);
   * ```
   */
  async createStream<O extends WriteOptions = WriteOptions>(
    params: CreateStreamParams,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    const label = params.label ?? '';
    const reference = params.reference ?? '';
    assertAddress(params.sender, 'sender');
    assertAddress(params.recipient, 'recipient');
    assertTokenId(params.token);
    const amount = parseAmount(params.amount);
    assertSchedule(params.startTime, params.endTime, params.cliffTime);
    assertMetadata(label, reference);
    return this.invoke(
      'create_stream',
      [
        addressToScVal(params.sender),
        addressToScVal(params.recipient),
        addressToScVal(params.token),
        nativeToScVal(amount, { type: 'i128' }),
        nativeToScVal(BigInt(params.startTime), { type: 'u64' }),
        nativeToScVal(BigInt(params.endTime), { type: 'u64' }),
        nativeToScVal(BigInt(params.cliffTime), { type: 'u64' }),
        nativeToScVal(label, { type: 'string' }),
        nativeToScVal(reference, { type: 'string' }),
      ],
      opts,
    );
  }

  /**
   * Withdraw the vested balance of a stream to its recipient. Only the
   * recipient's own key (or contract) can authorize it.
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @param opts - per-call write options; `opts.signal` aborts the prompt, submission and poll.
   * @returns `{ hash }` of the confirmed transaction; the amount actually
   *   transferred (vested minus the protocol fee) is not surfaced by the SDK,
   *   so read the stream again to see the new `withdrawn` total.
   * @throws Error when no `publicKey` / `signTransaction` was configured.
   * @throws StreamsError when the contract rejects the call — `STREAM_NOT_FOUND`,
   *   `NOTHING_TO_WITHDRAW` (before the cliff or when fully withdrawn), or
   *   `TREASURY_NOT_SET` when a fee is configured without a treasury.
   * @example
   * ```typescript
   * try {
   *   const { hash } = await client.withdraw(stream.id);
   *   console.log(`withdrawn in ${hash}`);
   * } catch (error) {
   *   if (error instanceof StreamsError && error.code === 'NOTHING_TO_WITHDRAW') {
   *     console.log(`vested from ${new Date(stream.cliffTime * 1_000)}`);
   *   }
   * }
   * ```
   */
  async withdraw<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke('withdraw', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
  }

  /**
   * Cancel a stream, refunding the unvested balance to the sender. Only the
   * sender can authorize it, and cancelling twice is an error rather than a
   * no-op.
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @param opts - per-call write options; `opts.signal` aborts the prompt, submission and poll.
   * @returns The hash of the confirmed transaction; the stream keeps
   *   `cancelled: true` and the recipient can still withdraw what vested.
   * @throws Error when no `publicKey` / `signTransaction` was configured.
   * @throws StreamsError when the contract rejects the call — `STREAM_NOT_FOUND`
   *   or `ALREADY_CANCELLED`.
   * @example
   * ```typescript
   * const { hash } = await client.cancel(stream.id);
   * const cancelled = await client.getStream(stream.id);
   * console.log(cancelled?.cancelled === true); // true
   * ```
   */
  async cancel<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke('cancel', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
  }

  /**
   * Hand a stream off to `newRecipient`, e.g. after a key rotation or a sale.
   * The connected wallet signs as the contract's `caller` and must be the
   * stream's current recipient, otherwise the call fails with `UNAUTHORIZED`.
   *
   * Everything not yet withdrawn — including a balance that has vested but was
   * never claimed — becomes withdrawable by `newRecipient` only, so call
   * `withdraw` first to keep what has already vested.
   *
   * @param id - Stream id as `bigint`, `number`, or decimal string.
   * @param newRecipient - The `G...` or `C...` address that takes over the stream.
   * @param opts - per-call write options; `opts.signal` aborts the prompt, submission and poll.
   * @returns The hash of the confirmed transaction.
   * @throws Error when no `publicKey` was configured, or `newRecipient` is not a valid address.
   * @throws StreamsError when the contract rejects the call — `STREAM_NOT_FOUND`,
   *   `UNAUTHORIZED` or `SAME_RECIPIENT`.
   */
  async transferRecipient<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    newRecipient: string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    const { publicKey } = this;
    if (!publicKey) {
      throw new Error('A connected wallet is required to submit transactions.');
    }
    assertAddress(newRecipient, 'newRecipient');
    return this.invoke(
      'transfer_recipient',
      [
        nativeToScVal(BigInt(id), { type: 'u64' }),
        addressToScVal(publicKey),
        addressToScVal(newRecipient),
      ],
      opts,
    );
  }
}

/**
 * A typed client for the escrow contract, mirroring `StreamsClient`: reads
 * simulate against Soroban RPC, writes run through the same pre-flight, sign,
 * submit, and poll pipeline (and accept an `AbortSignal`).
 */
export class EscrowClient extends SorobanClient {
  protected readonly errorCodes = ESCROW_ERROR_CODES;

  protected newContractError(message: string, contractCode: number | undefined): Error {
    return new EscrowError(message, contractCode);
  }

  /** Fetch an escrow by id. Returns `null` if it does not exist. */
  async getEscrow(id: bigint | number | string): Promise<Escrow | null> {
    const raw = await this.simulate('get_escrow', nativeToScVal(BigInt(id), { type: 'u64' }));
    return raw === null ? null : normalizeEscrow(raw);
  }

  /**
   * Create an escrow in the `created` (unfunded) state. `payer` must sign for
   * it; `id` is chosen by the caller and must not exist yet.
   */
  async createEscrow<O extends WriteOptions = WriteOptions>(
    params: CreateEscrowParams,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    assertTokenId(params.token);
    return this.invoke(
      'create_escrow',
      [
        nativeToScVal(BigInt(params.id), { type: 'u64' }),
        addressToScVal(params.payer),
        addressToScVal(params.payee),
        addressToScVal(params.arbiter),
        addressToScVal(params.token),
        nativeToScVal(BigInt(params.amount), { type: 'i128' }),
        nativeToScVal(BigInt(params.deadline), { type: 'u64' }),
      ],
      opts,
    );
  }

  /** Fund the escrow, transferring its amount of the token from the payer. */
  async fundEscrow<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke('fund_escrow', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
  }

  /** Release the funds to the payee. `caller` must be the payer or the arbiter. */
  async releaseEscrow<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    caller: string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke(
      'release_escrow',
      [nativeToScVal(BigInt(id), { type: 'u64' }), addressToScVal(caller)],
      opts,
    );
  }

  /** Refund the funds to the payer. `caller` must be the payee or the arbiter. */
  async refundEscrow<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    caller: string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke(
      'refund_escrow',
      [nativeToScVal(BigInt(id), { type: 'u64' }), addressToScVal(caller)],
      opts,
    );
  }

  /**
   * Cancel the escrow. `caller` must be the payer; a funded escrow can only be
   * cancelled once its deadline has passed.
   */
  async cancelEscrow<O extends WriteOptions = WriteOptions>(
    id: bigint | number | string,
    caller: string,
    opts: O = {} as O,
  ): Promise<WriteResultFor<O>> {
    return this.invoke(
      'cancel_escrow',
      [nativeToScVal(BigInt(id), { type: 'u64' }), addressToScVal(caller)],
      opts,
    );
  }
}

/** The configured endpoints, primary first, without duplicates or blanks. */
function configuredRpcUrls(options: StreamsClientOptions): string[] {
  const urls: string[] = [];
  const add = (url: string | undefined) => {
    const trimmed = url?.trim();
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed);
  };
  if (options.rpcUrls?.length) {
    for (const url of options.rpcUrls) add(url);
  } else {
    add(options.rpcUrl);
  }
  return urls;
}

/** Validates a caller-supplied base fee and normalises it to a decimal string. */
function validateFee(fee: string): string {
  if (!/^\d+$/.test(fee)) {
    throw new Error(`Invalid fee: ${fee}. Expected a decimal integer string of stroops.`);
  }
  const value = BigInt(fee);
  if (value <= 0n) {
    throw new Error(`Invalid fee: ${fee}. Must be greater than 0.`);
  }
  return value.toString();
}

/** Maximum value of a Stellar id memo: an unsigned 64-bit integer. */
const MAX_MEMO_ID = 2n ** 64n - 1n;
/** A text memo is capped at 28 UTF-8 bytes by the Stellar protocol. */
const MAX_MEMO_TEXT_BYTES = 28;

/** Converts a {@link TransactionMemo} into the SDK's `Memo` value. */
function toMemo(memo: TransactionMemo): Memo {
  if (memo.type === 'text') {
    if (typeof memo.value !== 'string') {
      throw new Error('Invalid memo: text memos require a string value.');
    }
    const bytes = new TextEncoder().encode(memo.value).length;
    if (bytes > MAX_MEMO_TEXT_BYTES) {
      throw new Error(`Invalid memo text: ${bytes} bytes. Must be at most ${MAX_MEMO_TEXT_BYTES}.`);
    }
    return Memo.text(memo.value);
  }
  if (memo.type !== 'id') {
    throw new Error(`Invalid memo type: ${String((memo as { type?: unknown }).type)}.`);
  }
  let id: bigint;
  try {
    id = BigInt(memo.value);
  } catch {
    throw new Error(`Invalid memo id: ${String(memo.value)}. Expected an unsigned 64-bit integer.`);
  }
  if (id < 0n || id > MAX_MEMO_ID) {
    throw new Error(`Invalid memo id: ${id}. Must be between 0 and ${MAX_MEMO_ID}.`);
  }
  return Memo.id(id.toString());
}

function assertTokenId(tokenId: string): void {
  if (!StrKey.isValidContract(tokenId)) {
    throw new Error(`Invalid token contract id: ${tokenId}. Expected a C... contract address.`);
  }
}

function assertAddress(address: string, field: 'sender' | 'recipient' | 'newRecipient'): void {
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
    throw new Error(
      `Invalid ${field}: ${address}. Expected a G... account address or C... contract address.`,
    );
  }
}

/**
 * Throws unless `address` decodes as a Stellar account, muxed account, or
 * contract.
 *
 * Unlike the write-path validator this has no sender/recipient to name: listing
 * streams takes one address and matches it against both sides of an event.
 */
function assertStreamAddress(address: string): void {
  try {
    new Address(address);
  } catch {
    throw new Error(`Invalid address: ${address}. Expected a G..., M..., or C... address.`);
  }
}

/** Parses `params.amount` and enforces the contract's `amount > 0`. */
function parseAmount(amount: string): bigint {
  let value: bigint;
  try {
    value = BigInt(amount);
  } catch {
    throw new Error(`Invalid amount: ${amount}. Expected a decimal integer string.`);
  }
  if (value <= 0n) {
    throw new Error(`Invalid amount: ${amount}. Must be greater than 0.`);
  }
  return value;
}

/** Mirrors the contract's schedule checks: `start < end` and `cliff` within. */
function assertSchedule(startTime: number, endTime: number, cliffTime: number): void {
  if (endTime <= startTime) {
    throw new Error(`Invalid endTime: ${endTime}. Must be greater than startTime (${startTime}).`);
  }
  if (cliffTime < startTime || cliffTime > endTime) {
    throw new Error(
      `Invalid cliffTime: ${cliffTime}. Must be between startTime (${startTime}) and endTime (${endTime}).`,
    );
  }
}

/**
 * Caps `label`/`reference` the way the contract does: the stored strings are
 * bounded in UTF-8 bytes so a stream's rent stays predictable.
 */
function assertMetadata(label: string, reference: string): void {
  const labelBytes = new TextEncoder().encode(label).length;
  if (labelBytes > MAX_LABEL_BYTES) {
    throw new Error(`Invalid label: ${labelBytes} bytes. Must be at most ${MAX_LABEL_BYTES}.`);
  }
  const referenceBytes = new TextEncoder().encode(reference).length;
  if (referenceBytes > MAX_REFERENCE_BYTES) {
    throw new Error(
      `Invalid reference: ${referenceBytes} bytes. Must be at most ${MAX_REFERENCE_BYTES}.`,
    );
  }
}

/** A topic value, in the base64 XDR encoding `getEvents` filters expect. */
function topicSymbol(symbol: string): string {
  return xdr.ScVal.scvSymbol(symbol).toXDR('base64');
}

/**
 * A paging token is a TOID (19 decimal digits) and an event index (10 digits)
 * separated by a hyphen. Older nodes emitted shorter numeric tokens, so the
 * format check accepts any two decimal groups and leaves their meaning to the
 * node.
 */
function assertCursor(cursor: string): void {
  if (!/^\d+-\d+$/.test(cursor)) throw new InvalidCursorError(cursor);
}

/**
 * The ledger a cursor points at. The TOID's high bits are the ledger sequence;
 * accepting a bare ledger sequence keeps hand-written/test cursors usable.
 */
function cursorLedger(cursor: string): number {
  const prefix = BigInt(cursor.slice(0, cursor.indexOf('-')));
  const ledger = prefix > 0xffff_ffffn ? prefix >> 32n : prefix;
  if (ledger > BigInt(Number.MAX_SAFE_INTEGER)) throw new InvalidCursorError(cursor);
  return Number(ledger);
}

/** Adds a matching stream id to the page, deduplicated across pages. */
function collectStreamId(
  event: SorobanRpc.Api.EventResponse,
  address: string,
  endLedger: number | undefined,
  ids: bigint[],
  seen: Set<string>,
): void {
  if (endLedger !== undefined && event.ledger > endLedger) return;
  const id = createdStreamId(event, address);
  if (id === null) return;
  const key = id.toString();
  if (seen.has(key)) return;
  seen.add(key);
  ids.push(id);
}

/**
 * The id announced by a `("stream", "created", id)` event, or `null` when the
 * event is not one or does not involve `address`.
 *
 * Shape decoding is delegated to the shared protocol decoders in `./events`
 * (merged upstream in #259) so this client and its consumers agree on one
 * definition of the contract event payloads. The address check uses the
 * event's own payload rather than a follow-up read, so a busy contract's
 * unrelated streams cost no RPC round trips per address.
 */
function createdStreamId(event: SorobanRpc.Api.EventResponse, address: string): bigint | null {
  if (!event.inSuccessfulContractCall) return null;
  const decoded = decodeStreamEvent(event.topic, event.value);
  if (!decoded || decoded.type !== 'StreamCreated') return null;
  if (decoded.sender !== address && decoded.recipient !== address) return null;
  return decoded.id;
}

function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function formatElapsed(ms: number): string {
  return `${(ms / 1_000).toFixed(1)}s`;
}

/**
 * The result code that actually describes what happened to the contract call.
 * A fee-bump envelope reports its inner transaction one level down
 * (`txFeeBumpInnerFailed`), and failures like a stale sequence number belong to
 * that inner transaction rather than to the sponsor's envelope.
 */
function innermostResult(
  result: xdr.TransactionResultResult | undefined,
): xdr.TransactionResultResult | xdr.InnerTransactionResultResult | undefined {
  if (!result) return undefined;
  const name = result.switch().name;
  if (name === 'txFeeBumpInnerFailed' || name === 'txFeeBumpInnerSuccess') {
    return result.innerResultPair().result().result();
  }
  return result;
}

/**
 * Summarises a `TransactionResult` as its result code plus the first
 * operation's code. For a fee-bump envelope the inner transaction's code is
 * reported, since that is the failure the caller cares about.
 */
function describeTransactionResult(result: xdr.TransactionResult | undefined): string {
  if (!result) return 'no result returned';
  try {
    const inner = innermostResult(result.result()) ?? result.result();
    const code = inner.switch().name;
    const opResults = code === 'txFailed' || code === 'txSuccess' ? inner.results() : [];
    const op = opResults[0];
    if (op && op.switch().name === 'opInner') {
      const tr = op.tr();
      const value = tr.value() as { switch?: () => { name: string } } | undefined;
      const opCode = value?.switch?.().name;
      return opCode ? `${code} (${opCode})` : code;
    }
    return code;
  } catch {
    return 'unreadable result';
  }
}

/** Extracts the `error` diagnostic events emitted by the host, if any. */
function describeDiagnostics(events: xdr.DiagnosticEvent[] | undefined): string {
  if (!events?.length) return '';
  const messages: string[] = [];
  for (const event of events) {
    try {
      const body = event.event().body().v0();
      const [first, ...rest] = body.topics();
      if (!first || first.switch().name !== 'scvSymbol' || first.sym().toString() !== 'error') {
        continue;
      }
      messages.push([...rest.map(formatScVal), formatScVal(body.data())].join(' '));
    } catch {
      // Skip events we cannot decode rather than masking the original failure.
    }
  }
  return messages.length ? ` — diagnostics: ${messages.join('; ')}` : '';
}

function formatScVal(value: xdr.ScVal): string {
  if (value.switch().name === 'scvError') {
    const error = value.error();
    const kind = error.switch().name.replace(/^sce/, '');
    return kind === 'Contract'
      ? `Error(Contract, #${error.contractCode()})`
      : `Error(${kind}, ${error.code().name.replace(/^scec/, '')})`;
  }
  try {
    const native = scValToNative(value);
    return typeof native === 'string'
      ? native
      : JSON.stringify(native, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return value.switch().name;
  }
}

/** The contract error code inside a host error string, e.g. `Error(Contract, #4)`. */
function contractErrorCode(message: string): number | undefined {
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(message);
  return match ? Number(match[1]) : undefined;
}

/** The first contract error code among the host's diagnostic events, if any. */
function contractErrorCodeFromEvents(
  events: xdr.DiagnosticEvent[] | undefined,
): number | undefined {
  for (const event of events ?? []) {
    try {
      const [first, second] = event.event().body().v0().topics();
      if (
        first?.switch().name === 'scvSymbol' &&
        first.sym().toString() === 'error' &&
        second?.switch().name === 'scvError' &&
        second.error().switch().name === 'sceContract'
      ) {
        return second.error().contractCode();
      }
    } catch {
      // Undecodable events are skipped; the message still carries the raw result.
    }
  }
  return undefined;
}
