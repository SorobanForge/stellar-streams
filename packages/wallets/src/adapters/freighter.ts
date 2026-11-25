import {
  resolveNetworkPassphrase,
  type WalletAdapter,
  type SignTransactionOptions,
} from './adapter.js';
import type { WalletType } from '../WalletProvider';

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
    } catch {
      const res = await api.getAddress();
      address = res.address;
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

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const { signTransaction } = await freighterApi();
    const { signedTxXdr } = await signTransaction(xdr, {
      networkPassphrase: resolveNetworkPassphrase(opts),
      address: this.publicKey ?? '',
    });
    return signedTxXdr;
  }

  async signAuthEntry(entryXdr: string, opts?: SignTransactionOptions): Promise<string> {
    const { signAuthEntry } = await freighterApi();
    const { signedAuthEntry } = await signAuthEntry(entryXdr, {
      networkPassphrase: resolveNetworkPassphrase(opts),
      address: this.publicKey ?? '',
    });
    if (!signedAuthEntry) {
      throw new Error('Failed to sign auth entry.');
    }
    return signedAuthEntry;
  }
}