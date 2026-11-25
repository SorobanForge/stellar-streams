/**
 * Ledger hardware wallet adapter for the Stellar app.
 *
 * The device bindings (`@ledgerhq/hw-transport-webhid` and
 * `@ledgerhq/hw-app-str`) are loaded with dynamic `import()` inside the connect
 * path, so a bundler emits them as a separate chunk. Pages that never select
 * Ledger therefore never download the transport, and the default bundle stays
 * free of Ledger code.
 */
import { StrKey, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  PUBLIC_NETWORK_PASSPHRASE,
  TESTNET_PASSPHRASE,
  resolveNetworkPassphrase,
  type SignTransactionOptions,
  type WalletAdapter,
} from './adapter.js';
import type { WalletType } from '../WalletProvider';

/** Stellar's account-level BIP32 path: purpose / coin type / account. */
export const DEFAULT_LEDGER_DERIVATION_PATH = "44'/148'/0'";

/** Only account-level Stellar paths are supported; the device needs a full path. */
const DERIVATION_PATH_PATTERN = /^44'\/148'\/\d+'$/;

/**
 * Raised when the adapter is asked to do something its configuration does not
 * allow, such as signing for a network it was not configured for.
 */
export class LedgerConfigurationError extends Error {
  readonly code = 'LEDGER_CONFIGURATION';

  constructor(message: string) {
    super(message);
    this.name = 'LedgerConfigurationError';
  }
}

/** Structural view of the subset of `@ledgerhq/hw-app-str` this adapter uses. */
export interface LedgerStellarApp {
  getPublicKey(path: string, display?: boolean): Promise<{ rawPublicKey: Uint8Array }>;
  signTransaction(path: string, signatureBase: Uint8Array): Promise<{ signature: Uint8Array }>;
}

/** Structural view of a HID transport; only closing it is our concern. */
export interface LedgerTransport {
  close(): Promise<void>;
}

export type LedgerAppConstructor = new (transport: LedgerTransport) => LedgerStellarApp;

export interface LedgerAdapterOptions {
  /** Account-level BIP32 path. Defaults to `DEFAULT_LEDGER_DERIVATION_PATH`. */
  derivationPath?: string;
  /** Network the adapter is allowed to sign for. Defaults to Testnet. */
  networkPassphrase?: string;
  /** Overrides the WebHID transport loader (tests, or a non-WebHID host). */
  createTransport?: () => Promise<LedgerTransport>;
  /** Overrides the `@ledgerhq/hw-app-str` loader (tests). */
  loadStellarApp?: () => Promise<LedgerAppConstructor>;
}

/** The public key type `StrKey` accepts; avoids naming Node's `Buffer` directly. */
type Ed25519PublicKey = Parameters<typeof StrKey.encodeEd25519PublicKey>[0];

/** Loads the WebHID transport only when Ledger is actually selected. */
async function createWebHidTransport(): Promise<LedgerTransport> {
  const { default: TransportWebHID } = await import('@ledgerhq/hw-transport-webhid');
  return TransportWebHID.create();
}

/** Loads the Stellar app binding only when Ledger is actually selected. */
async function loadDefaultLedgerApp(): Promise<LedgerAppConstructor> {
  const { default: Str } = await import('@ledgerhq/hw-app-str');
  return Str as unknown as LedgerAppConstructor;
}

function networkLabel(passphrase: string): string {
  if (passphrase === TESTNET_PASSPHRASE) return 'Testnet';
  if (passphrase === PUBLIC_NETWORK_PASSPHRASE) return 'Mainnet';
  return `the custom network "${passphrase}"`;
}

/** Base64-encodes bytes without depending on Node's `Buffer`. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Turns a raw Ledger/USB error into a message a user can act on. Returning
 * `null` leaves the caller's fallback in place for unknown failures.
 */
function describeDeviceError(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const { name, statusCode, message } = err as {
    name?: string;
    statusCode?: number;
    message?: string;
  };

  if (name === 'StellarUserRefusedError') {
    return 'User rejected the request on the Ledger device.';
  }
  if (name === 'StellarDataTooLargeError') {
    return 'The transaction is too large for the Ledger device to sign.';
  }
  if (name === 'LockedDeviceError' || statusCode === 0x5515) {
    return 'The Ledger device is locked. Unlock it and try again.';
  }
  if (statusCode === 0x6e00 || statusCode === 0x6d00) {
    return 'The Stellar app is not open on the Ledger device. Open it on the device and try again.';
  }
  if (typeof message === 'string' && message.toLowerCase().includes('no device selected')) {
    return 'No Ledger device was selected. Connect the device, unlock it, and approve the browser prompt.';
  }
  return null;
}

/**
 * Adapter for a Ledger device running the Stellar app.
 *
 * The network passphrase can be pinned at construction. When it is, signing for
 * another network rejects with `LedgerConfigurationError` before the device is
 * touched, because the device signs the signature base for whatever passphrase
 * the host computed: a silent mismatch would produce a signature that no node
 * accepts. When it is not pinned, the adapter follows the network each signing
 * call names (Testnet when it names none), which is what `WalletProvider` does
 * as its network selection changes. The derivation path is configurable so
 * funds can live on a non-default account index.
 *
 * Limitations (see the package README):
 * - WebHID is required, so Chromium-based browsers over HTTPS only.
 * - The Stellar app must be open and the device unlocked.
 * - Soroban auth-entry signing is not implemented; `signAuthEntry` is absent
 *   and `WalletProvider` raises `NotSupportedError` for it.
 */
export class LedgerAdapter implements WalletAdapter {
  readonly id: WalletType = 'ledger';
  readonly name = 'Ledger';
  readonly derivationPath: string;
  /**
   * Passphrase the adapter is pinned to, or `null` when it follows the network
   * each signing call names (Testnet when the call names none).
   */
  readonly networkPassphrase: string | null;

  private publicKey: string | null = null;
  private transport: LedgerTransport | null = null;
  private app: LedgerStellarApp | null = null;

  private readonly createTransport: () => Promise<LedgerTransport>;
  private readonly loadStellarApp: () => Promise<LedgerAppConstructor>;
  /** True when the default WebHID loader is in use, so the capability check applies. */
  private readonly usesWebHid: boolean;

  constructor(options: LedgerAdapterOptions = {}) {
    const derivationPath = options.derivationPath ?? DEFAULT_LEDGER_DERIVATION_PATH;
    if (!DERIVATION_PATH_PATTERN.test(derivationPath)) {
      throw new LedgerConfigurationError(
        `Invalid Ledger derivation path "${derivationPath}". ` +
          `Expected an account-level Stellar path such as "${DEFAULT_LEDGER_DERIVATION_PATH}".`,
      );
    }

    this.derivationPath = derivationPath;
    this.networkPassphrase = options.networkPassphrase ?? null;
    this.createTransport = options.createTransport ?? createWebHidTransport;
    this.loadStellarApp = options.loadStellarApp ?? loadDefaultLedgerApp;
    this.usesWebHid = !options.createTransport;
  }

  /** Ledger talks to the device over WebHID, which not every browser exposes. */
  async isAvailable(): Promise<boolean> {
    if (!this.usesWebHid) return true;
    return (
      typeof navigator !== 'undefined' &&
      typeof (navigator as Navigator & { hid?: unknown }).hid !== 'undefined'
    );
  }

  async connect(): Promise<string> {
    const app = await this.getApp();
    let rawPublicKey: Uint8Array;
    try {
      ({ rawPublicKey } = await app.getPublicKey(this.derivationPath, false));
    } catch (err) {
      throw new Error(
        describeDeviceError(err) ?? 'Failed to read the Stellar address from the Ledger device.',
        { cause: err },
      );
    }

    const publicKey = StrKey.encodeEd25519PublicKey(rawPublicKey as Ed25519PublicKey);
    this.publicKey = publicKey;
    return publicKey;
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;
    return this.connect();
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    // A caller that names a network is authoritative; otherwise a pinned
    // passphrase applies, falling back to Testnet (the provider default).
    const requestedPassphrase =
      opts?.networkPassphrase ?? (opts?.network ? resolveNetworkPassphrase(opts) : null);
    const pinned = this.networkPassphrase;

    if (pinned && requestedPassphrase && requestedPassphrase !== pinned) {
      throw new LedgerConfigurationError(
        `The Ledger adapter is configured for ${networkLabel(pinned)} ` +
          `but ${networkLabel(requestedPassphrase)} was requested. ` +
          'Configure the adapter with the same networkPassphrase the transaction was built for.',
      );
    }

    const passphrase = pinned ?? requestedPassphrase ?? TESTNET_PASSPHRASE;
    const app = await this.getApp();
    const transaction = TransactionBuilder.fromXDR(xdr, passphrase);

    let signature: Uint8Array;
    try {
      ({ signature } = await app.signTransaction(this.derivationPath, transaction.signatureBase()));
    } catch (err) {
      throw new Error(
        describeDeviceError(err) ?? 'The Ledger device did not sign the transaction.',
        { cause: err },
      );
    }

    transaction.addSignature(await this.getPublicKey(), toBase64(signature));
    return transaction.toEnvelope().toXDR('base64');
  }

  /** Closes the HID session opened by `connect()`. Safe to call when idle. */
  async disconnect(): Promise<void> {
    this.publicKey = null;
    this.app = null;
    await this.closeTransport();
  }

  /** Opens the device and app bindings on first use, then reuses them. */
  private async getApp(): Promise<LedgerStellarApp> {
    if (this.app) return this.app;

    if (!(await this.isAvailable())) {
      throw new Error(
        'Ledger requires WebHID, which this browser does not support. ' +
          'Use a Chromium-based browser over HTTPS, or a WebHID-capable transport.',
      );
    }

    try {
      const transport = await this.createTransport();
      this.transport = transport;
      const StellarApp = await this.loadStellarApp();
      this.app = new StellarApp(transport);
    } catch (err) {
      await this.closeTransport();
      throw new Error(describeDeviceError(err) ?? 'Unable to connect to the Ledger device.', {
        cause: err,
      });
    }

    return this.app;
  }

  private async closeTransport(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    if (!transport) return;
    try {
      await transport.close();
    } catch {
      // The device may already be unplugged; disconnecting is still successful.
    }
  }
}
