/**
 * Configurable wallet mock shared by the adapter tests.
 *
 * Every adapter used to hand-roll its own fake extension global (or its own
 * module mock), so each new adapter's tests copied the previous suite and
 * drifted. This mock owns the four things an adapter test needs to drive: a
 * successful connect, a successful signature, a user rejection, and a
 * disconnect. The `as*` helpers translate that one state machine into the shape
 * each wallet SDK exposes — the Freighter module, the Albedo intent client, or
 * an injected `window.rabet` — so adding an adapter does not mean writing
 * another fake.
 *
 * Every provider call the mock serves is appended to `wallet.calls`, which is
 * what the adapter tests assert on.
 */

/** Operations an adapter can perform through the mock. */
export type MockWalletMethod = 'connect' | 'sign' | 'signAuthEntry' | 'disconnect';

/** One recorded provider call, in the order the adapter made it. */
export interface MockWalletCall {
  readonly method: MockWalletMethod;
  readonly args: readonly unknown[];
}

export interface MockWalletOptions {
  /** Address the mock reports. Defaults to a fixed test address. */
  address?: string;
  /** XDR returned from a successful `sign` call. */
  signedXdr?: string;
  /**
   * Auth-entry XDR returned from a successful `signAuthEntry` call. `null`
   * mimics a wallet that approves the request but returns no signature.
   */
  signedAuthEntry?: string | null;
}

/** Signing options the Freighter adapter forwards to its SDK. */
export interface FreighterSignOptions {
  networkPassphrase?: string;
  address?: string;
}

/** The subset of `@stellar/freighter-api` the Freighter adapter calls. */
export interface FreighterApiMock {
  isConnected(): Promise<{ isConnected: boolean }>;
  requestAccess(): Promise<{ address: string }>;
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    xdr: string,
    options?: FreighterSignOptions,
  ): Promise<{ signedTxXdr: string; signerAddress: string }>;
  signAuthEntry(
    entryXdr: string,
    options?: FreighterSignOptions,
  ): Promise<{ signedAuthEntry: string | null; signerAddress: string }>;
}

/** The subset of `@albedo-link/intent` the Albedo adapter calls. */
export interface AlbedoIntentMock {
  publicKey(input?: Record<string, unknown>): Promise<{
    pubkey: string;
    signature: string;
    signed_message: string;
  }>;
  tx(input: { xdr: string; network?: string }): Promise<{
    signed_envelope_xdr: string;
    tx_hash: string;
    xdr: string;
    network: string;
    result: string;
  }>;
}

/** The injected provider the Rabet adapter reads from `window.rabet`. */
export interface RabetProviderMock {
  connect(): Promise<{ publicKey: string }>;
  sign(xdr: string, network: string): Promise<string>;
  disconnect(): Promise<void>;
}

const DEFAULT_ADDRESS = 'GBMOCKWALLET7ZQ4Q7M4M6Q4M6Q4M6Q4M6Q4M6Q4M6Q4M6Q4M6Q4M6Q4';
const DEFAULT_SIGNED_XDR = 'signed-xdr';
const DEFAULT_SIGNED_AUTH_ENTRY = 'signed-auth-entry-xdr';
const DEFAULT_REJECTION = 'User rejected the request.';

interface MockWalletState {
  address: string;
  signedXdr: string;
  signedAuthEntry: string | null;
  connected: boolean;
  /** Set by `reject()` and consumed by the next prompt, like a real rejection. */
  pendingError: Error | null;
}

export interface MockWallet {
  /** Address the next connect resolves with. */
  readonly address: string;
  /** Ordered log of the provider calls the adapter made. */
  readonly calls: readonly MockWalletCall[];
  /** Whether the mock's provider currently reports an installed wallet. */
  readonly connected: boolean;

  /** Control: the next `connect()` resolves with this address (default: unchanged). */
  connect(address?: string): MockWallet;
  /** Control: the next signing call resolves with this XDR. */
  sign(signedXdr?: string): MockWallet;
  /** Control: the next auth-entry call resolves with this XDR, or `null` for no signature. */
  signAuthEntry(signedXdr?: string | null): MockWallet;
  /** Control: the next connect or signing prompt is rejected with this message. */
  reject(message?: string): MockWallet;
  /** Control: mark the provider as no longer connected, e.g. the session ended. */
  disconnect(): MockWallet;
  /** Reset configuration and the call log between tests. */
  reset(): void;

  /** Module shape for a `vi.mock('@stellar/freighter-api', …)` factory. */
  asFreighterModule(): FreighterApiMock & { default: FreighterApiMock };
  /** Module shape for a `vi.mock('@albedo-link/intent', …)` factory. */
  asAlbedoModule(): { default: AlbedoIntentMock };
  /** Provider shape to assign to `window.rabet` (or a Rabet-like global). */
  asRabetProvider(): RabetProviderMock;
}

/**
 * Creates a wallet mock. Each test file should create one instance, hand its
 * adapter surface to the module/global the adapter reads, and call `reset()`
 * in `beforeEach`.
 */
export function createMockWallet(options: MockWalletOptions = {}): MockWallet {
  const initialState: MockWalletState = {
    address: options.address ?? DEFAULT_ADDRESS,
    signedXdr: options.signedXdr ?? DEFAULT_SIGNED_XDR,
    signedAuthEntry:
      options.signedAuthEntry === undefined ? DEFAULT_SIGNED_AUTH_ENTRY : options.signedAuthEntry,
    connected: true,
    pendingError: null,
  };

  let state: MockWalletState = { ...initialState };
  let calls: MockWalletCall[] = [];

  function record(method: MockWalletMethod, ...args: unknown[]): void {
    calls.push({ method, args });
  }

  /** Throws (and clears) a pending rejection, the way a prompt would. */
  function guard(): void {
    const error = state.pendingError;
    state.pendingError = null;
    if (error) throw error;
  }

  const wallet: MockWallet = {
    get address() {
      return state.address;
    },
    get calls() {
      return calls;
    },
    get connected() {
      return state.connected;
    },

    connect(address) {
      if (address !== undefined) state.address = address;
      state.connected = true;
      state.pendingError = null;
      return wallet;
    },

    sign(signedXdr) {
      if (signedXdr !== undefined) state.signedXdr = signedXdr;
      state.pendingError = null;
      return wallet;
    },

    signAuthEntry(signedXdr) {
      if (signedXdr !== undefined) state.signedAuthEntry = signedXdr;
      state.pendingError = null;
      return wallet;
    },

    reject(message = DEFAULT_REJECTION) {
      state.pendingError = new Error(message);
      return wallet;
    },

    disconnect() {
      state.connected = false;
      return wallet;
    },

    reset() {
      state = { ...initialState };
      calls = [];
    },

    asFreighterModule() {
      const api: FreighterApiMock = {
        async isConnected() {
          return { isConnected: state.connected };
        },
        async requestAccess() {
          record('connect', 'requestAccess');
          guard();
          return { address: state.address };
        },
        async getAddress() {
          record('connect', 'getAddress');
          guard();
          return { address: state.address };
        },
        async signTransaction(xdr, signOptions) {
          record('sign', xdr, signOptions);
          guard();
          return { signedTxXdr: state.signedXdr, signerAddress: state.address };
        },
        async signAuthEntry(entryXdr, signOptions) {
          record('signAuthEntry', entryXdr, signOptions);
          guard();
          return { signedAuthEntry: state.signedAuthEntry, signerAddress: state.address };
        },
      };
      // The real package ships CommonJS, so the adapter reaches it through the
      // namespace's `default`; mirror that here.
      return Object.assign(api, { default: api });
    },

    asAlbedoModule() {
      const client: AlbedoIntentMock = {
        async publicKey(input) {
          record('connect', 'publicKey', input);
          guard();
          return { pubkey: state.address, signature: '', signed_message: '' };
        },
        async tx(input) {
          record('sign', input.xdr, { network: input.network });
          guard();
          return {
            signed_envelope_xdr: state.signedXdr,
            tx_hash: 'mock-tx-hash',
            xdr: input.xdr,
            network: input.network ?? 'testnet',
            result: 'ok',
          };
        },
      };
      // The real package ships UMD, so the adapter reaches it through `default`.
      return { default: client };
    },

    asRabetProvider() {
      return {
        async connect() {
          record('connect');
          guard();
          return { publicKey: state.address };
        },
        async sign(xdr, network) {
          record('sign', xdr, network);
          guard();
          return state.signedXdr;
        },
        async disconnect() {
          record('disconnect');
        },
      };
    },
  };

  return wallet;
}
