import {
  Account,
  Address,
  Asset,
  Contract,
  FeeBumpTransaction,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import type { CreateStreamParams, Stream, StreamConfig } from '@stellar-starter-kit/types';

export interface StreamsClientOptions {
  /** The deployed `stream` contract id (C...). */
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
   * Sponsor the submission fees of every write with a fee-bump transaction.
   * The connected wallet still signs the inner transaction, so the contract
   * sees the user as the source account; only the fee comes from `feeSource`.
   * Leave this unset to submit the wallet-signed transaction unchanged.
   */
  feeBump?: FeeBumpOptions;
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
/** `getStream` calls {@link StreamsClient.listStreams} runs at a time. */
const STREAM_FETCH_CONCURRENCY = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Integer division rounded up, for splitting a total fee across operations. */
function ceilDiv(total: bigint, parts: bigint): bigint {
  return (total + parts - 1n) / parts;
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
  | 'METADATA_TOO_LONG';

/** Stable identifiers for the splits contract's `SplitError` enum. */
export type SplitErrorCode =
  | 'EmptyRecipients'
  | 'LengthMismatch'
  | 'InvalidShares'
  | 'InvalidAmount'
  | 'DuplicateRecipient'
  | 'SplitNotFound'
  | 'Unauthorized';
/**
 * The one place the contract's numeric codes are named. Must stay in sync with
 * the `StreamError` enum in `contracts/stream/src/lib.rs`; codes outside this
 * table fall back to the raw error message instead of failing the mapping.
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
   * First ledger to scan, inclusive. Defaults to
   * `latestLedger - DEFAULT_EVENT_LOOKBACK_LEDGERS`, read from the RPC node.
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
}

/**
 * A typed client for the Stellar Streams protocol. Read calls simulate against
 * Soroban RPC. Write calls are simulated first — aborting with a readable
 * `StreamsError` before any wallet prompt when the contract would reject them
 * — then prepared, signed by the injected wallet signer, submitted, and polled
 * to completion.
 */
export class StreamsClient {
  private readonly server: SorobanRpc.Server;
  private readonly options: StreamsClientOptions;
  /**
   * The source account (and its sequence number), fetched once and shared by
   * every simulate/invoke call. Cached as a promise so concurrent reads — e.g.
   * `getStream` and `claimable` issued together — share one `getAccount`.
   */
  private account: Promise<Account> | null = null;
  /** Token metadata never changes for a deployed contract, so cache it per id. */
  private readonly tokens = new Map<string, Promise<TokenMetadata>>();

  constructor(options: StreamsClientOptions) {
    this.options = options;
    this.server = new SorobanRpc.Server(options.rpcUrl);
  }

  /** Builds the contract handle on demand (kept lazy so the client can be
   * constructed before a contract id is configured, e.g. during SSR). */
  private get contract(): Contract {
    if (!this.options.contractId) {
      throw new Error('No stream contract id configured.');
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
      const pending = this.server.getAccount(publicKey);
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

  /** Simulates a read-only call on the stream contract and returns the decoded result. */
  private simulate(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
    return this.simulateOn(this.contract, method, ...args);
  }

  /** Simulates a read-only call on any contract and returns the decoded result. */
  private async simulateOn(
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

    const response = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(response)) {
      throw simulationFailure(method, response.error);
    }
    const retval = response.result?.retval;
    if (!retval) {
      throw new Error(`Simulation of ${method} returned no value.`);
    }
    return scValToNative(retval);
  }

  /** Builds, signs, submits and confirms a state-changing contract call. */
  private async invoke(method: string, ...args: xdr.ScVal[]): Promise<{ hash: string }> {
    const { publicKey, signTransaction, networkPassphrase } = this.options;
    if (!publicKey || !signTransaction) {
      throw new Error('A connected wallet is required to submit transactions.');
    }

    // A cached sequence can go stale if the account transacted elsewhere; in
    // that case re-fetch it once and rebuild instead of failing the call.
    for (let attempt = 0; ; attempt++) {
      const account = await this.sourceAccount();
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
        const simulated = await this.server.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationError(simulated)) {
          throw simulationFailure(method, simulated.error);
        }
      }

      const prepared = await this.server.prepareTransaction(tx);
      const signedXdr = await signTransaction(prepared.toXDR(), {
        networkPassphrase,
        address: publicKey,
      });
      const inner = TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction;

      let hash: string;
      try {
        hash = await this.submit(this.options.feeBump ? await this.bumpFees(inner) : inner);
      } catch (error) {
        this.invalidateAccount();
        if (error instanceof StaleSequenceError && attempt === 0) continue;
        throw error;
      }
      // Invalidation point: once the network has accepted the transaction its
      // sequence number is consumed (whether it later succeeds or fails).
      this.invalidateAccount();
      return this.poll(hash);
    }
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
  private async submit(tx: Parameters<SorobanRpc.Server['sendTransaction']>[0]): Promise<string> {
    const startedAt = Date.now();
    let delay = this.pollIntervalMs;
    for (;;) {
      const submitted = await this.server.sendTransaction(tx);
      if (submitted.status === 'ERROR') {
        if (innermostResult(submitted.errorResult?.result())?.switch().name === 'txBadSeq') {
          throw new StaleSequenceError(
            `Transaction ${submitted.hash} used a stale sequence number.`,
          );
        }
        throw new StreamsError(
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
      await sleep(delay);
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
  }

  /** Polls `getTransaction` until the transaction succeeds, fails, or times out. */
  private async poll(hash: string): Promise<{ hash: string }> {
    const startedAt = Date.now();
    for (;;) {
      const result = await this.server.getTransaction(hash);
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
      await sleep(this.pollIntervalMs);
    }
  }

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
   * the ledger window and page size to scan it with.
   * @returns the matching streams, ordered by the ledger their `created` event
   * landed in, oldest first. Streams whose storage entry has been archived are
   * skipped.
   * @throws Error when `address` is not a Stellar address or the ledger range
   * is empty or unusable.
   * @throws StreamsError when a `getStream` lookup for a matched event fails.
   */
  async listStreams(options: ListStreamsOptions): Promise<Stream[]> {
    const { address } = options;
    assertStreamAddress(address);
    const pageSize = options.pageSize ?? DEFAULT_EVENT_PAGE_SIZE;
    if (pageSize < 1) {
      throw new Error(`pageSize must be at least 1, got: ${pageSize}.`);
    }

    let startLedger = options.startLedger;
    let endLedger = options.endLedger;
    if (startLedger === undefined) {
      // Anchor the default window on the node's own tip: that is the only
      // reference guaranteed to keep the scan inside its event retention.
      const { sequence } = await this.server.getLatestLedger();
      startLedger = Math.max(1, sequence - DEFAULT_EVENT_LOOKBACK_LEDGERS);
      if (endLedger === undefined) endLedger = sequence;
    }
    if (endLedger !== undefined && endLedger < startLedger) {
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
    /** Reads one page of events; returns whether the scan has reached its end. */
    const collect = (events: SorobanRpc.Api.EventResponse[]): boolean => {
      for (const event of events) {
        if (endLedger !== undefined && event.ledger > endLedger) return true;
        const id = createdStreamId(event, address);
        if (id === null) continue;
        const key = id.toString();
        if (seen.has(key)) continue;
        seen.add(key);
        ids.push(id);
      }
      return false;
    };

    // Soroban RPC rejects a getEvents request that mixes a cursor with a ledger
    // range, so the scan opens in ledger mode and continues from the returned
    // cursor, honouring endLedger on this side of the wire instead.
    let page = await this.server.getEvents({
      filters,
      startLedger,
      ...(endLedger === undefined ? {} : { endLedger }),
      limit: pageSize,
    });
    for (;;) {
      if (collect(page.events)) break;
      // Freeze the tip at the first response so streams created while this call
      // runs cannot appear on a later page and shift the end from under it.
      if (endLedger === undefined) endLedger = page.latestLedger;
      if (page.events.length === 0 || !page.cursor) break;
      page = await this.server.getEvents({ filters, cursor: page.cursor, limit: pageSize });
    }

    const streams: Stream[] = [];
    for (let i = 0; i < ids.length; i += STREAM_FETCH_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + STREAM_FETCH_CONCURRENCY).map((id) => this.getStream(id)),
      );
      streams.push(...batch.filter((stream): stream is Stream => stream !== null));
    }
    return streams;
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
  async createStream(params: CreateStreamParams): Promise<{ hash: string }> {
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
      addressToScVal(params.sender),
      addressToScVal(params.recipient),
      addressToScVal(params.token),
      nativeToScVal(amount, { type: 'i128' }),
      nativeToScVal(BigInt(params.startTime), { type: 'u64' }),
      nativeToScVal(BigInt(params.endTime), { type: 'u64' }),
      nativeToScVal(BigInt(params.cliffTime), { type: 'u64' }),
      nativeToScVal(label, { type: 'string' }),
      nativeToScVal(reference, { type: 'string' }),
    );
  }

  /** Withdraw the vested balance of a stream to its recipient. */
  async withdraw(id: bigint | number | string): Promise<{ hash: string }> {
    return this.invoke('withdraw', nativeToScVal(BigInt(id), { type: 'u64' }));
  }

  /** Cancel a stream, refunding the unvested balance to the sender. */
  async cancel(id: bigint | number | string): Promise<{ hash: string }> {
    return this.invoke('cancel', nativeToScVal(BigInt(id), { type: 'u64' }));
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

function isScSymbol(value: xdr.ScVal | undefined, symbol: string): boolean {
  return value?.switch().name === 'scvSymbol' && value.sym().toString() === symbol;
}

/**
 * The id announced by a `("stream", "created", id)` event, or `null` when the
 * event is not one or does not involve `address`.
 *
 * The address check uses the event's own `(sender, recipient, amount)` payload
 * rather than a follow-up read, so a busy contract's unrelated streams cost no
 * RPC round trips per address.
 */
function createdStreamId(event: SorobanRpc.Api.EventResponse, address: string): bigint | null {
  if (!event.inSuccessfulContractCall) return null;
  const [tag, action, id] = event.topic;
  if (!isScSymbol(tag, 'stream') || !isScSymbol(action, 'created')) return null;
  if (id?.switch().name !== 'scvU64') return null;
  let parties: unknown;
  try {
    parties = scValToNative(event.value);
  } catch {
    // A payload from a future contract version this client cannot decode is
    // not a match; the id-only fallback would list streams for the wrong user.
    return null;
  }
  const [sender, recipient] = parties as [string, string];
  if (sender !== address && recipient !== address) return null;
  return BigInt(id.u64().toString());
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

/**
 * A `StreamsError` for a failed simulation. Known contract codes are named in
 * the message; unknown ones keep the raw error text untouched.
 */
function simulationFailure(method: string, error: string): StreamsError {
  const contractCode = contractErrorCode(error);
  const code = contractCode === undefined ? undefined : STREAM_ERROR_CODES[contractCode];
  if (code === undefined || contractCode === undefined) {
    return new StreamsError(`Simulation of ${method} failed: ${error}`, contractCode);
  }
  return new StreamsError(
    `Simulation of ${method} failed: ${code} (contract error #${contractCode}) — ${error}`,
    contractCode,
  );
}
