import {
  resolveNetworkPassphrase,
  type WalletAdapter,
  type SignTransactionOptions,
} from './adapter.js';
import type { WalletType } from '../WalletProvider';
import { toWalletLockedError } from '../errors.js';

// @stellar/freighter-api ships CommonJS, so its functions are only reachable
// through the namespace's `default`: a named import works under a bundler but
// throws at runtime everywhere else. Importing it here (at module scope) would
// also put the client in the chunk every page loads before a wallet is chosen,
// so it is awaited on first use instead.
async function freighterApi() {
  const { default: api } = await import('@stellar/freighter-api');
  return api;
}

/** Adapter for the Freighter wallet extension (@stellar/freighter-api v6). */
export class FreighterAdapter implements WalletAdapter {
  readonly id: WalletType = 'freighter';
  readonly name = 'Freighter';

  private publicKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    const api = await freighterApi();
    const { isConnected: connected } = await api.isConnected();
    return connected === true;
  }

  async connect(): Promise<string> {
    const api = await freighterApi();
    const connection = await api.isConnected();
    if (!connection.isConnected) {
      throw new Error('Freighter wallet extension is not installed or enabled.');
    }

    let address: string;
    try {
      const access = await api.requestAccess();
      address = access.address;
    } catch (err) {
      // A locked extension rejects access the same way a denied request does;
      // falling back to getAddress would only repeat the opaque rejection.
      const locked = toWalletLockedError(err, this.name);
      if (locked) throw locked;

      try {
        const res = await api.getAddress();
        address = res.address;
      } catch (fallbackErr) {
        throw toWalletLockedError(fallbackErr, this.name) ?? fallbackErr;
      }
    }

    if (!address) {
      throw new Error('Failed to retrieve public key from wallet.');
    }

    this.publicKey = address;
    return address;
  }

  async getPublicKey(): Promise<string> {
    // Always ask the extension — a cached key could belong to a different
    // account or browser profile, which is exactly what session restore has
    // to detect. The result is still cached for the signing methods.
    const api = await freighterApi();
    const res = await api.getAddress();
    if (!res.address) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = res.address;
    return res.address;
  }

  async getNetworkPassphrase(): Promise<string | null> {
    const api = await freighterApi();
    try {
      const details = await api.getNetworkDetails?.();
      if (details?.networkPassphrase) return details.networkPassphrase;
    } catch {
      // Older Freighter versions do not expose getNetworkDetails.
    }
    try {
      const details = await api.getNetwork?.();
      return details?.networkPassphrase || null;
    } catch {
      return null;
    }
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const api = await freighterApi();
    try {
      const { signedTxXdr } = await api.signTransaction(xdr, {
        networkPassphrase: resolveNetworkPassphrase(opts),
        address: this.publicKey ?? '',
      });
      return signedTxXdr;
    } catch (err) {
      throw toWalletLockedError(err, this.name) ?? err;
    }
  }

  async signAuthEntry(entryXdr: string, opts?: SignTransactionOptions): Promise<string> {
    const api = await freighterApi();
    let signedAuthEntry: string | null | undefined;
    try {
      ({ signedAuthEntry } = await api.signAuthEntry(entryXdr, {
        networkPassphrase: resolveNetworkPassphrase(opts),
        address: this.publicKey ?? '',
      }));
    } catch (err) {
      throw toWalletLockedError(err, this.name) ?? err;
    }
    if (!signedAuthEntry) {
      throw new Error('Failed to sign auth entry.');
    }
    return signedAuthEntry;
  }
}
