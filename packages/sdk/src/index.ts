import {
  Account,
  Address,
  Contract,
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
  /** Base delay between confirmation polls and submission retries. Defaults to 1s. */
  pollIntervalMs?: number;
  /** How long to wait for a submitted transaction to confirm. Defaults to 30s. */
  pollTimeoutMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;
/** Upper bound for the exponential backoff applied to `TRY_AGAIN_LATER`. */
const MAX_BACKOFF_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Raised when the network rejects a submission because its sequence number is stale. */
class StaleSequenceError extends Error {}

/**
 * A typed client for the Stellar Streams protocol. Read calls simulate against
 * Soroban RPC; write calls are prepared, signed by the injected wallet signer,
 * submitted, and polled to completion.
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

  /** Simulates a read-only contract call and returns the decoded result. */
  private async simulate(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
    const account = await this.sourceAccount();
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.options.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const response = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(response)) {
      throw new Error(`Simulation of ${method} failed: ${response.error}`);
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

      const prepared = await this.server.prepareTransaction(tx);
      const signedXdr = await signTransaction(prepared.toXDR(), {
        networkPassphrase,
        address: publicKey,
      });

      let hash: string;
      try {
        hash = await this.submit(
          TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Parameters<
            SorobanRpc.Server['sendTransaction']
          >[0],
        );
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
        if (submitted.errorResult?.result().switch().name === 'txBadSeq') {
          throw new StaleSequenceError(
            `Transaction ${submitted.hash} used a stale sequence number.`,
          );
        }
        throw new Error(
          `Transaction ${submitted.hash} was rejected: ${describeTransactionResult(submitted.errorResult)}` +
            describeDiagnostics(submitted.diagnosticEvents),
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

  /** Currently withdrawable amount for a stream, in stroops. */
  async claimable(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('claimable', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /** Total amount vested so far, in stroops. */
  async vested(id: bigint | number | string): Promise<bigint> {
    return (await this.simulate('vested', nativeToScVal(BigInt(id), { type: 'u64' }))) as bigint;
  }

  /** The id the next stream will receive. */
  async nextStreamId(): Promise<bigint> {
    return (await this.simulate('next_stream_id')) as bigint;
  }

  /** Lock tokens and open a new stream. */
  async createStream(params: CreateStreamParams): Promise<{ hash: string }> {
    return this.invoke(
      'create_stream',
      addressToScVal(params.sender),
      addressToScVal(params.recipient),
      addressToScVal(params.token),
      nativeToScVal(BigInt(params.amount), { type: 'i128' }),
      nativeToScVal(BigInt(params.startTime), { type: 'u64' }),
      nativeToScVal(BigInt(params.endTime), { type: 'u64' }),
      nativeToScVal(BigInt(params.cliffTime), { type: 'u64' }),
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
    cancelled: raw.cancelled,
  };
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
