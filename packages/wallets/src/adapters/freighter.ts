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
    } catch {
      const res = await getFreighterAddress();
      address = res.address;
    }

    if (!address) {
      throw new Error('Failed to retrieve public key from wallet.');
    }

    this.publicKey = address;
    return address;
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;
    const res = await getFreighterAddress();
    if (!res.address) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = res.address;
    return res.address;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const { signedTxXdr } = await signFreighterTransaction(xdr, {
      networkPassphrase: resolveNetworkPassphrase(opts),
      address: this.publicKey ?? '',
    });
    return signedTxXdr;
  }

  async signAuthEntry(entryXdr: string, opts?: SignTransactionOptions): Promise<string> {
    const { signedAuthEntry } = await signFreighterAuthEntry(entryXdr, {
      networkPassphrase: resolveNetworkPassphrase(opts),
      address: this.publicKey ?? '',
    });
    if (!signedAuthEntry) {
      throw new Error('Failed to sign auth entry.');
    }
    return signedAuthEntry;
  }
}
