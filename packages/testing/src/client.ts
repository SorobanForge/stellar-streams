import { CONTRACT_ID, NETWORK_PASSPHRASE, PUBLIC_KEY } from './fixtures';
import { createFakeTransport, type FakeTransport, type FakeTransportOptions } from './transport';

/**
 * The options a test client is built with. Structurally identical to the SDK's
 * `StreamsClientOptions`, so `new StreamsClient(config)` type-checks without
 * this package depending on the SDK (which would make the workspace graph
 * circular: the SDK's tests depend on this package).
 */
export interface TestClientConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  publicKey?: string;
  signTransaction?: (
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ) => Promise<string>;
  skipSimulation?: boolean;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

/** Options for {@link createTestClient}: client overrides plus the fake RPC layer. */
export interface CreateTestClientOptions extends Partial<TestClientConfig> {
  /** Reuse an existing transport instead of installing a new one. */
  transport?: FakeTransport;
  /** Options for the transport created when `transport` is not given. */
  transportOptions?: FakeTransportOptions;
}

export interface TestClientHarness<C> {
  /** A client built from the defaults plus any overrides given to `createTestClient`. */
  client: C;
  /** The fake RPC layer every client from this harness talks to. */
  transport: FakeTransport;
  /** Builds another client with per-test overrides, sharing the same transport. */
  withClient: (overrides?: Partial<TestClientConfig>) => C;
  /** Restores the real `SorobanRpc.Server` methods. */
  restore: () => void;
}

/**
 * Test defaults: a contract id and wallet that are valid but never deployed, an
 * unreachable RPC URL (the fake transport answers instead), polling fast enough
 * that a timeout test finishes in milliseconds, and a signer that returns the
 * transaction unchanged.
 */
export const TEST_CLIENT_DEFAULTS: TestClientConfig = {
  contractId: CONTRACT_ID,
  rpcUrl: 'https://rpc.invalid',
  networkPassphrase: NETWORK_PASSPHRASE,
  publicKey: PUBLIC_KEY,
  signTransaction: async (txXdr) => txXdr,
  pollIntervalMs: 1,
  pollTimeoutMs: 200,
};

/**
 * Wires an SDK client (or anything else built from a `TestClientConfig`) to a
 * {@link FakeTransport}.
 *
 * This package ships no dependency on `@stellar-starter-kit/sdk` — the SDK's own
 * tests depend on this one, so importing the client here would make the
 * workspace graph circular. Pass the constructor in instead:
 *
 * ```ts
 * const { client, transport } = createTestClient((config) => new StreamsClient(config));
 * transport.respondWith({ get_stream: streamScVal() });
 * await expect(client.getStream(1)).resolves.toMatchObject({ id: '1' });
 * ```
 */
export function createTestClient<C>(
  createClient: (config: TestClientConfig) => C,
  options: CreateTestClientOptions = {},
): TestClientHarness<C> {
  const { transport: existing, transportOptions, ...overrides } = options;
  const transport = existing ?? createFakeTransport(transportOptions);

  const build = (extra: Partial<TestClientConfig> = {}): C =>
    createClient({ ...TEST_CLIENT_DEFAULTS, ...overrides, ...extra });

  return {
    client: build(),
    transport,
    withClient: (extra = {}) => build(extra),
    restore: () => transport.restore(),
  };
}
