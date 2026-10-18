import {
  Account,
  Address,
  Asset,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
// Type-only: the SDK never imports another workspace package at runtime, so
// its tests run in CI's `test` job straight off a checkout with no build step.
import type {
  CreateEscrowParams,
  CreateStreamParams,
  Escrow,
  EscrowStatus,
  Stream,
  StreamConfig,
} from '@stellar-starter-kit/types';

/** Options for changing an operation from outside, e.g. cancelling it when a page unmounts. */
export interface WriteOptions {
  /** Aborts the wallet prompt, the submission, and the confirmation poll for this call. */
  signal?: AbortSignal;
}

export interface StreamsClientOptions {
  /** The deployed contract id (C...): the `stream` contract for `StreamsClient`, the `escrow` contract for `EscrowClient`. */
  contractId: string;
  /** Soroban RPC endpoint, e.g. https://soroban-testnet.stellar.org. */
  rpcUrl: string;
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
   * built from `rpcUrl`; pass an in-memory fake in tests to run the suite
   * without a network.
   */
  transport?: StreamsTransport;
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
  sendTransaction(tx: Transaction): Promise<SorobanRpc.Api.SendTransactionResponse>;
  getTransaction(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse>;
}

/** On-chain metadata of a SEP-41 token contract (any SAC or custom Soroban token). */
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
/** Upper bound for the exponential backoff applied to `TRY_AGAIN_LATER`. */
const MAX_BACKOFF_MS = 8_000;
/** Must match `MAX_LABEL_LEN` in the stream contract. */
const MAX_LABEL_BYTES = 64;
/** Must match `MAX_REFERENCE_LEN` in the stream contract. */
const MAX_REFERENCE_BYTES = 128;

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

/** Raised when the network rejects a submission because its sequence number is stale. */
class StaleSequenceError extends Error {}

/** Stable identifiers for the stream contract's `StreamError` enum. */
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
  | 'EMPTY_BATCH'
  | 'BATCH_TOO_LARGE'
  | 'BATCH_OVERFLOW';

/** Stable identifiers for the splits contract's `SplitError` enum. */
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
  // 12 is reserved by in-flight contract work; codes are append-only.
  13: 'EMPTY_BATCH',
  14: 'BATCH_TOO_LARGE',
  15: 'BATCH_OVERFLOW',
};

/**
 * Raised when a call fails with one of the stream contract's own errors, e.g.
 * withdrawing from a stream with nothing vested. `code` is a stable identifier
 * that survives contract redeploys; `contractCode` is the raw numeric code.
 * Both are undefined when the failure is not a known contract error, in which
 * case `message` carries the raw diagnostics.
 */
export class StreamsError extends Error {
  /** Stable identifier for the contract error, e.g. `STREAM_NOT_FOUND`. */
  readonly code?: StreamErrorCode;
  /** The raw numeric code from the contract's `StreamError` enum. */
  readonly contractCode?: number;

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
  private readonly options: StreamsClientOptions;
  /**
   * The source account (and its sequence number), fetched once and shared by
   * every simulate/invoke call. Cached as a promise so concurrent reads — e.g.
   * `getStream` and `claimable` issued together — share one `getAccount`.
   */
  private account: Promise<Account> | null = null;

  constructor(options: StreamsClientOptions) {
    this.options = options;
    this.transport = options.transport ?? new SorobanRpc.Server(options.rpcUrl);
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

  /** The configured contract id. */
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
  protected async invoke(
    method: string,
    args: xdr.ScVal[],
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
    const { publicKey, signTransaction, networkPassphrase } = this.options;
    if (!publicKey || !signTransaction) {
      throw new Error('A connected wallet is required to submit transactions.');
    }
    const signal = opts.signal ?? this.options.signal;

    // A cached sequence can go stale if the account transacted elsewhere; in
    // that case re-fetch it once and rebuild instead of failing the call.
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      const account = await this.sourceAccount();
      throwIfAborted(signal);
      const tx = new TransactionBuilder(account, {
        fee: '1000000',
        networkPassphrase,
      })
        .addOperation(this.contract.call(method, ...args))
        .setTimeout(30)
        .build();

      // Simulate before preparing so a call that cannot succeed fails with the
      // contract's own error instead of an opaque failure mid-assembly — and
      // without opening a wallet prompt for a doomed transaction.
      if (!this.options.skipSimulation) {
        const simulated = await this.transport.simulateTransaction(tx);
        throwIfAborted(signal);
        if (SorobanRpc.Api.isSimulationError(simulated)) {
          throw this.simulationFailure(method, simulated.error);
        }
      }

      throwIfAborted(signal);
      const prepared = await this.transport.prepareTransaction(tx);
      // Never open a wallet prompt for a call the caller already cancelled.
      throwIfAborted(signal);
      const signedXdr = await signTransaction(prepared.toXDR(), {
        networkPassphrase,
        address: publicKey,
      });
      throwIfAborted(signal);

      let hash: string;
      try {
        hash = await this.submit(
          TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction,
          signal,
        );
      } catch (error) {
        this.invalidateAccount();
        if (error instanceof StaleSequenceError && attempt === 0) continue;
        throw error;
      }
      // Invalidation point: once the network has accepted the transaction its
      // sequence number is consumed (whether it later succeeds or fails).
      this.invalidateAccount();
      return this.poll(hash, signal);
    }
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
  private async submit(tx: Transaction, signal?: AbortSignal): Promise<string> {
    const startedAt = Date.now();
    let delay = this.pollIntervalMs;
    for (;;) {
      throwIfAborted(signal);
      const submitted = await this.transport.sendTransaction(tx);
      if (submitted.status === 'ERROR') {
        if (submitted.errorResult?.result().switch().name === 'txBadSeq') {
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
 * `StreamsError` before any wallet prompt when the contract would reject them
 * — then prepared, signed by the injected wallet signer, submitted, and polled
 * to completion. Write calls accept an `AbortSignal` that cancels the wallet
 * prompt, the submission and the confirmation poll.
 */
export class StreamsClient extends SorobanClient {
  protected readonly errorCodes = STREAM_ERROR_CODES;

  protected newContractError(message: string, contractCode: number | undefined): Error {
    return new StreamsError(message, contractCode);
  }

  /** Token metadata never changes for a deployed contract, so cache it per id. */
  private readonly tokens = new Map<string, Promise<TokenMetadata>>();

  /** Fetch a stream by id. Returns `null` if it does not exist. */
  async getStream(id: bigint | number | string): Promise<Stream | null> {
    const raw = (await this.simulate(
      'get_stream',
      nativeToScVal(BigInt(id), { type: 'u64' }),
    )) as RawStream | null;
    return raw ? normalizeStream(raw) : null;
  }

  /** Fetch protocol configuration. Returns `null` if the contract is uninitialized. */
  async getConfig(): Promise<StreamConfig | null> {
    const raw = (await this.simulate('get_config')) as RawConfig | null;
    if (!raw) return null;
    return { admin: raw.admin, treasury: raw.treasury, feeBps: Number(raw.fee_bps) };
  }

  /** Currently withdrawable amount for a stream, in the token's smallest unit. */
  async claimable(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('claimable', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /** Total amount vested so far, in the token's smallest unit. */
  async vested(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('vested', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /** The id the next stream will receive. */
  async nextStreamId(): Promise<bigint> {
    return (await this.simulate('next_stream_id')) as bigint;
  }

  /**
   * Reads `decimals` and `symbol` from a token contract. Works for any SEP-41
   * token: the native XLM SAC, an issued asset's SAC (see `assetContractId`),
   * or a custom Soroban token. Results are cached per contract id.
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
   * by the token's own `decimals` (see `getTokenMetadata`), not by 7.
   *
   * Inputs are validated before the transaction is built: an invalid address,
   * a non-positive amount, an inconsistent schedule or oversized metadata
   * throws a field-named error without spending a network round trip or a
   * wallet signature. `params.label` and `params.reference` default to no
   * metadata (empty strings).
   */
  async createStream(
    params: CreateStreamParams,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
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

  /** Withdraw the vested balance of a stream to its recipient. */
  async withdraw(id: bigint | number | string, opts: WriteOptions = {}): Promise<{ hash: string }> {
    return this.invoke('withdraw', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
  }

  /** Cancel a stream, refunding the unvested balance to the sender. */
  async cancel(id: bigint | number | string, opts: WriteOptions = {}): Promise<{ hash: string }> {
    return this.invoke('cancel', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
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
    const raw = (await this.simulate(
      'get_escrow',
      nativeToScVal(BigInt(id), { type: 'u64' }),
    )) as RawEscrow | null;
    return raw ? normalizeEscrow(raw) : null;
  }

  /**
   * Create an escrow in the `created` (unfunded) state. `payer` must sign for
   * it; `id` is chosen by the caller and must not exist yet.
   */
  async createEscrow(
    params: CreateEscrowParams,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
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
  async fundEscrow(
    id: bigint | number | string,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
    return this.invoke('fund_escrow', [nativeToScVal(BigInt(id), { type: 'u64' })], opts);
  }

  /** Release the funds to the payee. `caller` must be the payer or the arbiter. */
  async releaseEscrow(
    id: bigint | number | string,
    caller: string,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
    return this.invoke(
      'release_escrow',
      [nativeToScVal(BigInt(id), { type: 'u64' }), addressToScVal(caller)],
      opts,
    );
  }

  /** Refund the funds to the payer. `caller` must be the payee or the arbiter. */
  async refundEscrow(
    id: bigint | number | string,
    caller: string,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
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
  async cancelEscrow(
    id: bigint | number | string,
    caller: string,
    opts: WriteOptions = {},
  ): Promise<{ hash: string }> {
    return this.invoke(
      'cancel_escrow',
      [nativeToScVal(BigInt(id), { type: 'u64' }), addressToScVal(caller)],
      opts,
    );
  }
}

interface RawStream {
  id: bigint;
  sender: string;
  recipient: string;
  token: string;
  total_amount: bigint;
  withdrawn: bigint;
  start_time: bigint;
  end_time: bigint;
  cliff_time: bigint;
  label: string;
  reference: string;
  cancelled: boolean;
}

interface RawConfig {
  admin: string;
  treasury: string;
  fee_bps: number;
}

interface RawEscrow {
  id: bigint;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: bigint;
  deadline: bigint;
  status: number;
}

function normalizeStream(raw: RawStream): Stream {
  return {
    id: raw.id.toString(),
    sender: raw.sender,
    recipient: raw.recipient,
    token: raw.token,
    totalAmount: raw.total_amount.toString(),
    withdrawn: raw.withdrawn.toString(),
    startTime: Number(raw.start_time),
    endTime: Number(raw.end_time),
    cliffTime: Number(raw.cliff_time),
    label: raw.label,
    reference: raw.reference,
    cancelled: raw.cancelled,
  };
}

function normalizeEscrow(raw: RawEscrow): Escrow {
  return {
    id: raw.id.toString(),
    payer: raw.payer,
    payee: raw.payee,
    arbiter: raw.arbiter,
    token: raw.token,
    amount: raw.amount.toString(),
    deadline: Number(raw.deadline),
    status: escrowStatusFromIndex(Number(raw.status)),
  };
}

/** Maps the escrow contract's numeric status discriminant to its name, in enum order. */
const ESCROW_STATUSES: readonly EscrowStatus[] = [
  'created',
  'funded',
  'released',
  'refunded',
  'cancelled',
];

function escrowStatusFromIndex(index: number): EscrowStatus {
  const status = ESCROW_STATUSES[index];
  if (!status) {
    throw new Error(`Unknown escrow status index: ${index}`);
  }
  return status;
}

function assertTokenId(tokenId: string): void {
  if (!StrKey.isValidContract(tokenId)) {
    throw new Error(`Invalid token contract id: ${tokenId}. Expected a C... contract address.`);
  }
}

function assertAddress(address: string, field: 'sender' | 'recipient'): void {
  if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
    throw new Error(
      `Invalid ${field}: ${address}. Expected a G... account address or C... contract address.`,
    );
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

function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

function formatElapsed(ms: number): string {
  return `${(ms / 1_000).toFixed(1)}s`;
}

/** Summarises a `TransactionResult` as its result code plus the first operation's code. */
function describeTransactionResult(result: xdr.TransactionResult | undefined): string {
  if (!result) return 'no result returned';
  try {
    const inner = result.result();
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
