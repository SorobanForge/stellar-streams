import type { WalletAdapter, SignTransactionOptions } from './adapter.js';
import type { WalletType } from '../WalletProvider.js';

interface XBullError {
  message?: string;
}

type XBullResult<T> = T | { error: XBullError };

interface XBullInterface {
  getAddress(): Promise<XBullResult<{ address: string }>>;
  signTransaction(params: {
    xdr: string;
    opts?: { networkPassphrase?: string; address?: string };
  }): Promise<XBullResult<{ signedTxXdr: string }>>;
  getNetwork?(): Promise<XBullResult<{ networkPassphrase: string }>>;
}

declare global {
  interface Window {
    xBullSDK?: XBullInterface;
  }
}

/** Adapter for the xBull wallet extension's injected SDK. */
export class XBullAdapter implements WalletAdapter {
  readonly id: WalletType = 'xbull';
  readonly name = 'xBull';

  private publicKey: string | null = null;

  private get xbull(): XBullInterface {
    if (!window.xBullSDK) throw new Error('xBull wallet extension is not installed.');
    return window.xBullSDK;
  }

  async isAvailable(): Promise<boolean> {
    return typeof window.xBullSDK !== 'undefined';
  }

  async connect(): Promise<string> {
    const result = await this.xbull.getAddress();
    if ('error' in result)
      throw new Error(result.error.message || 'xBull refused the connection request.');
    if (!result.address) throw new Error('Failed to retrieve public key from wallet.');
    this.publicKey = result.address;
    return result.address;
  }

  async getPublicKey(): Promise<string> {
    return this.connect();
  }

  async getNetworkPassphrase(): Promise<string | null> {
    if (!this.xbull.getNetwork) return null;
    try {
      const result = await this.xbull.getNetwork();
      return 'error' in result ? null : result.networkPassphrase || null;
    } catch {
      return null;
    }
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const result = await this.xbull.signTransaction({
      xdr,
      opts: { networkPassphrase: opts?.networkPassphrase, address: this.publicKey ?? '' },
    });
    if ('error' in result)
      throw new Error(result.error.message || 'xBull failed to sign the transaction.');
    return result.signedTxXdr;
  }
}
