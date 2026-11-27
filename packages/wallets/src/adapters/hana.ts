import type { WalletAdapter, SignTransactionOptions } from './adapter';
import type { WalletType } from '../WalletProvider';
import { toWalletLockedError } from '../errors.js';

interface HanaInterface {
  send: (
    method: string,
    params?: { xdr: string; network: string },
  ) => Promise<{ publicKey?: string; signedTransaction?: string } | string>;
}

declare global {
  interface Window {
    hanaWallet?: HanaInterface;
  }
}

/** Adapter for the Hana wallet extension (`window.hanaWallet`). */
export class HanaAdapter implements WalletAdapter {
  readonly id: WalletType = 'hana';
  readonly name = 'Hana';

  private publicKey: string | null = null;

  private get hana(): HanaInterface {
    const hana = (window as Window & { hanaWallet?: HanaInterface }).hanaWallet;
    if (!hana) {
      throw new Error('Hana wallet extension is not installed.');
    }
    return hana;
  }

  async isAvailable(): Promise<boolean> {
    return typeof (window as Window & { hanaWallet?: unknown }).hanaWallet !== 'undefined';
  }

  /** Sends an extension request, mapping a locked wallet onto a typed error. */
  private async send(
    method: string,
    params?: { xdr: string; network: string },
  ): Promise<{ publicKey?: string; signedTransaction?: string } | string> {
    try {
      return await this.hana.send(method, params);
    } catch (err) {
      throw toWalletLockedError(err, this.name) ?? err;
    }
  }

  private async getPublicKeyFromWallet(): Promise<string> {
    const res = await this.send('stellar:getPublicKey');
    const publicKey = typeof res === 'string' ? res : res.publicKey || '';
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    return publicKey;
  }

  async connect(): Promise<string> {
    this.publicKey = await this.getPublicKeyFromWallet();
    return this.publicKey;
  }

  async getPublicKey(): Promise<string> {
    // Never serve a cached key: restore has to see the account the extension
    // currently holds. The fetched key is still cached for signing.
    this.publicKey = await this.getPublicKeyFromWallet();
    return this.publicKey;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const network = opts?.network ?? 'TESTNET';
    const res = await this.send('stellar:signTransaction', {
      xdr,
      network: network.toLowerCase(),
    });
    return typeof res === 'string' ? res : res.signedTransaction || '';
  }
}
