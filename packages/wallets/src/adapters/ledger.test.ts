// @vitest-environment node
//
// `Transaction.addSignature` verifies the signature it attaches, so these tests
// sign with a real ed25519 keypair. jsdom's globals break the curve library's
// typed-array checks, so the suite runs in the node environment instead; the
// two WebHID capability tests define `navigator.hid` themselves.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Account, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  DEFAULT_LEDGER_DERIVATION_PATH,
  LedgerAdapter,
  LedgerConfigurationError,
  type LedgerAdapterOptions,
  type LedgerAppConstructor,
  type LedgerStellarApp,
  type LedgerTransport,
} from './ledger';
import { PUBLIC_NETWORK_PASSPHRASE, TESTNET_PASSPHRASE } from './adapter';

// The default options use these modules. They are mocked so the tests can count
// loads without a device; the adapter imports them dynamically in production.
vi.mock('@ledgerhq/hw-transport-webhid', () => {
  const create = vi.fn(async () => ({ close: vi.fn(async () => {}) }));
  return { default: { create } };
});

vi.mock('@ledgerhq/hw-app-str', () => ({
  default: class MockStellarApp {
    async getPublicKey() {
      return { rawPublicKey: new Uint8Array(32).fill(1) };
    }
    async signTransaction() {
      return { signature: new Uint8Array(64).fill(2) };
    }
  },
}));

import TransportWebHID from '@ledgerhq/hw-transport-webhid';

/** The byte type the SDK expects, without naming Node's `Buffer`. */
type Bytes = Parameters<typeof Keypair.fromRawEd25519Seed>[0];

/** Deterministic keypair so the assertions do not depend on entropy. */
function testKeypair(seedByte = 1): Keypair {
  return Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(seedByte) as Bytes);
}

async function sha256(bytes: Uint8Array): Promise<Bytes> {
  // `Uint8Array.from` allocates a fresh ArrayBuffer, so the cast is safe.
  const input = Uint8Array.from(bytes).buffer as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input)) as Bytes;
}

function buildTransactionXdr(passphrase = TESTNET_PASSPHRASE): string {
  return new TransactionBuilder(new Account(testKeypair(7).publicKey(), '1'), {
    fee: '100',
    networkPassphrase: passphrase,
  })
    .addOperation(Operation.manageData({ name: 'stream', value: '42' }))
    .setTimeout(30)
    .build()
    .toXDR();
}

/** Adds or removes WebHID support on the test process's navigator. */
function setWebHidSupport(supported: boolean): void {
  const nav = globalThis.navigator as (Navigator & { hid?: unknown }) | undefined;
  if (!nav) return;
  if (supported) {
    Object.defineProperty(nav, 'hid', { value: {}, configurable: true });
  } else {
    delete nav.hid;
  }
}

interface Harness {
  adapter: LedgerAdapter;
  keypair: Keypair;
  transport: LedgerTransport & { close: ReturnType<typeof vi.fn> };
  app: LedgerStellarApp & {
    getPublicKey: ReturnType<typeof vi.fn>;
    signTransaction: ReturnType<typeof vi.fn>;
  };
  createTransport: ReturnType<typeof vi.fn>;
  loadStellarApp: ReturnType<typeof vi.fn>;
}

/** Builds an adapter wired to a fake device and app binding. */
function makeHarness(options: LedgerAdapterOptions = {}): Harness {
  const keypair = testKeypair(1);

  const app = {
    getPublicKey: vi.fn(async () => ({ rawPublicKey: keypair.rawPublicKey() })),
    // The Stellar app hashes the signature base it receives and signs that
    // hash, which is what a signed transaction verifies against.
    signTransaction: vi.fn(async (_path: string, base: Uint8Array) => ({
      signature: keypair.sign(await sha256(base)),
    })),
  };

  const transport = { close: vi.fn(async () => {}) };
  const createTransport = vi.fn(async () => transport);
  const loadStellarApp = vi.fn(async () => {
    // A constructor that returns an object yields that object, which lets the
    // fake app stay a plain object with observable spies.
    return function MockStellarApp() {
      return app;
    } as unknown as LedgerAppConstructor;
  });

  const adapter = new LedgerAdapter({
    createTransport,
    loadStellarApp,
    ...options,
  });

  return {
    adapter,
    keypair,
    transport,
    app: app as Harness['app'],
    createTransport,
    loadStellarApp,
  };
}

describe('LedgerAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    setWebHidSupport(false);
  });

  it('has id ledger and name Ledger', () => {
    const { adapter } = makeHarness();
    expect(adapter.id).toBe('ledger');
    expect(adapter.name).toBe('Ledger');
  });

  it('does not load the transport or app binding before connect', () => {
    const { createTransport, loadStellarApp } = makeHarness();
    expect(createTransport).not.toHaveBeenCalled();
    expect(loadStellarApp).not.toHaveBeenCalled();
  });

  it('connect reads the public key for the default derivation path', async () => {
    const { adapter, keypair, app, createTransport, loadStellarApp } = makeHarness();

    await expect(adapter.connect()).resolves.toBe(keypair.publicKey());
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(loadStellarApp).toHaveBeenCalledTimes(1);
    expect(app.getPublicKey).toHaveBeenCalledWith(DEFAULT_LEDGER_DERIVATION_PATH, false);
    await expect(adapter.getPublicKey()).resolves.toBe(keypair.publicKey());
  });

  it('reuses the transport across repeated connects', async () => {
    const { adapter, createTransport, loadStellarApp } = makeHarness();

    await adapter.connect();
    await adapter.connect();
    await adapter.signTransaction(buildTransactionXdr());

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(loadStellarApp).toHaveBeenCalledTimes(1);
  });

  it('uses the configured derivation path', async () => {
    const { adapter, app } = makeHarness({ derivationPath: "44'/148'/5'" });

    await adapter.connect();

    expect(app.getPublicKey).toHaveBeenCalledWith("44'/148'/5'", false);
    expect(adapter.derivationPath).toBe("44'/148'/5'");
  });

  it('rejects a derivation path the device cannot use', () => {
    expect(() => new LedgerAdapter({ derivationPath: '44/148/0' })).toThrow(
      LedgerConfigurationError,
    );
    expect(() => new LedgerAdapter({ derivationPath: '44/148/0' })).toThrow(
      /Invalid Ledger derivation path/,
    );
  });

  it('signs the transaction signature base and returns a signed envelope', async () => {
    const { adapter, keypair, app } = makeHarness();
    const xdr = buildTransactionXdr();

    const signed = await adapter.signTransaction(xdr, { network: 'TESTNET' });

    const expectedBase = TransactionBuilder.fromXDR(xdr, TESTNET_PASSPHRASE).signatureBase();
    const [path, signatureBase] = app.signTransaction.mock.calls[0] as [string, Uint8Array];
    expect(path).toBe(DEFAULT_LEDGER_DERIVATION_PATH);
    expect(Array.from(signatureBase)).toEqual(Array.from(expectedBase));

    const parsed = TransactionBuilder.fromXDR(signed, TESTNET_PASSPHRASE);
    expect(parsed.signatures).toHaveLength(1);
    const [signature] = parsed.signatures;
    expect(Array.from(signature.signature())).toEqual(
      Array.from(keypair.sign(await sha256(expectedBase))),
    );
    expect(Array.from(signature.hint())).toEqual(Array.from(keypair.rawPublicKey().subarray(-4)));
  });

  it('signs with the configured network when no network is requested', async () => {
    const { adapter, app } = makeHarness({ networkPassphrase: PUBLIC_NETWORK_PASSPHRASE });

    await adapter.signTransaction(buildTransactionXdr(PUBLIC_NETWORK_PASSPHRASE));

    expect(app.signTransaction).toHaveBeenCalledTimes(1);
  });

  it('follows the requested network when no passphrase is pinned', async () => {
    const { adapter } = makeHarness();

    const xdr = buildTransactionXdr(PUBLIC_NETWORK_PASSPHRASE);
    const signed = await adapter.signTransaction(xdr, { network: 'MAINNET' });

    expect(() => TransactionBuilder.fromXDR(signed, PUBLIC_NETWORK_PASSPHRASE)).not.toThrow();
    expect(adapter.networkPassphrase).toBeNull();
  });

  it('rejects clearly when the requested network differs from the configured one', async () => {
    const { adapter, createTransport } = makeHarness({ networkPassphrase: TESTNET_PASSPHRASE });

    await expect(
      adapter.signTransaction(buildTransactionXdr(), { network: 'MAINNET' }),
    ).rejects.toThrow(LedgerConfigurationError);
    await expect(
      adapter.signTransaction(buildTransactionXdr(), { network: 'MAINNET' }),
    ).rejects.toThrow(/configured for Testnet but Mainnet was requested/);
    // The mismatch is caught before a device is opened.
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('maps a missing Stellar app onto an actionable message', async () => {
    const { adapter, app } = makeHarness();
    app.getPublicKey.mockRejectedValueOnce({ statusCode: 0x6e00 });

    await expect(adapter.connect()).rejects.toThrow(
      'The Stellar app is not open on the Ledger device. Open it on the device and try again.',
    );
  });

  it('passes through an unknown device failure with a clear fallback', async () => {
    const { adapter, app } = makeHarness();
    app.signTransaction.mockRejectedValueOnce(new Error('boom'));

    await expect(adapter.signTransaction(buildTransactionXdr())).rejects.toThrow(
      'The Ledger device did not sign the transaction.',
    );
  });

  it('disconnect closes the transport and allows a new session', async () => {
    const { adapter, transport, createTransport } = makeHarness();

    await adapter.connect();
    await adapter.disconnect();

    expect(transport.close).toHaveBeenCalledTimes(1);

    await adapter.connect();
    expect(createTransport).toHaveBeenCalledTimes(2);
  });

  it('disconnect is safe when nothing was connected', async () => {
    const { adapter } = makeHarness();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  it('reports and rejects when the browser has no WebHID support', async () => {
    setWebHidSupport(false);
    const adapter = new LedgerAdapter();

    await expect(adapter.isAvailable()).resolves.toBe(false);
    await expect(adapter.connect()).rejects.toThrow(/WebHID/);
  });

  it('loads the WebHID transport only on the first connect', async () => {
    setWebHidSupport(true);
    const adapter = new LedgerAdapter();

    expect(TransportWebHID.create).not.toHaveBeenCalled();

    await adapter.connect();

    expect(TransportWebHID.create).toHaveBeenCalledTimes(1);
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });
});
