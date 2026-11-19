// @stellar/freighter-api ships CommonJS, so a default import is the only form
// Node's ESM resolver can load; named imports from it work under a bundler but
// throw at runtime everywhere else.
import freighterApi from '@stellar/freighter-api';

const {
  isConnected: checkFreighterConnected,
  getAddress: getFreighterAddress,
  signTransaction: signFreighterTransaction,
  signAuthEntry: signFreighterAuthEntry,
  requestAccess: requestFreighterAccess,
} = freighterApi;
import {
  resolveNetworkPassphrase,
  type WalletAdapter,
  type SignTransactionOptions,
} from './adapter.js';
import type { WalletType } from '../WalletProvider';
import { toWalletLockedError } from '../errors.js';

/** Adapter for the Freighter wallet extension (@stellar/freighter-api v6). */
export class FreighterAdapter implements WalletAdapter {
  readonly id: WalletType = 'freighter';
  readonly name = 'Freighter';

  private publicKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    const { isConnected } = await checkFreighterConnected();
    return isConnected === true;
  }

  async connect(): Promise<string> {
    const connection = await checkFreighterConnected();
    if (!connection.isConnected) {
      throw new Error('Freighter wallet extension is not installed or enabled.');
    }

    let address: string;
    try {
      const access = await requestFreighterAccess();
      address = access.address;
    } catch (err) {
      // A locked extension rejects access the same way a denied request does;
      // falling back to getAddress would only repeat the opaque rejection.
      const locked = toWalletLockedError(err, this.name);
      if (locked) throw locked;

      try {
        const res = await getFreighterAddress();
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
    const res = await getFreighterAddress();
    if (!res.address) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = res.address;
    return res.address;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    try {
      const { signedTxXdr } = await signFreighterTransaction(xdr, {
        networkPassphrase: resolveNetworkPassphrase(opts),
        address: this.publicKey ?? '',
      });
      return signedTxXdr;
    } catch (err) {
      throw toWalletLockedError(err, this.name) ?? err;
    }
  }

  async signAuthEntry(entryXdr: string, opts?: SignTransactionOptions): Promise<string> {
    let signedAuthEntry: string | null | undefined;
    try {
      ({ signedAuthEntry } = await signFreighterAuthEntry(entryXdr, {
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
