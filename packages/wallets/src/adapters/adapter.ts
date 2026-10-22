/**
 * Shared interface every wallet adapter must implement.
 *
 * Keeping the connection, public-key retrieval, and signing logic behind this
 * interface lets each wallet live in its own module and be tested without
 * mounting React. The interface intentionally mirrors the flow that
 * `WalletProvider` used to inline, so behaviour is preserved one-to-one.
 */
import type { WalletType } from '../WalletProvider';

export type SignTransactionOptions = {
  /** Target network, e.g. `'TESTNET'` or `'MAINNET'`. */
  network?: string;
  /** Explicit network passphrase; overrides the network-derived default. */
  networkPassphrase?: string;
};

/** Default Stellar network passphrases, mirroring `WalletProvider`. */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const PUBLIC_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Resolves the network passphrase from the signing options. */
export function resolveNetworkPassphrase(opts?: SignTransactionOptions): string {
  if (opts?.networkPassphrase) return opts.networkPassphrase;
  if (opts?.network && opts.network.toUpperCase() !== 'TESTNET') {
    return PUBLIC_NETWORK_PASSPHRASE;
  }
  return TESTNET_PASSPHRASE;
}

export interface WalletAdapter {
  readonly id: WalletType;
  readonly name: string;
  /** Whether the wallet extension appears installed and reachable. */
  isAvailable(): Promise<boolean>;
  /** Connect to the wallet and return its public key. */
  connect(): Promise<string>;
  /**
   * End the extension session, when the wallet's API exposes one.
   *
   * Adapters that cannot revoke a session still have their provider state and
   * persisted keys cleared by `WalletProvider.disconnect`.
   */
  disconnect?(): Promise<void>;
  /** Return the connected public key. */
  getPublicKey(): Promise<string>;
  /** Sign a transaction XDR and return the signed envelope XDR. */
  signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string>;
  /**
   * Sign a Soroban authorization entry, returning the signed entry XDR.
   *
   * Only implement this when the wallet's SDK exposes auth-entry signing;
   * `WalletProvider.signAuthEntry` throws `NotSupportedError` otherwise.
   */
  signAuthEntry?(entryXdr: string, opts?: SignTransactionOptions): Promise<string>;
}
