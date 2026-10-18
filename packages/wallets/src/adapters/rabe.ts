import type { WalletAdapter, SignTransactionOptions } from './adapter';
import type { WalletType } from '../WalletProvider';

interface RabetInterface {
  connect: () => Promise<{ publicKey: string }>;
  sign: (xdr: string, network: string) => Promise<string>;
}

declare global {
  interface Window {
    rabet?: RabetInterface;
  }
}

/** Adapter for the Rabet wallet extension (`window.rabet`). */
export class RabetAdapter implements WalletAdapter {
  readonly id: WalletType = 'rabe';
  readonly name = 'Rabet';

  private publicKey: string | null = null;

  private get rabet(): RabetInterface {
    const rabet = (window as Window & { rabet?: RabetInterface }).rabet;
    if (!rabet) {
      throw new Error('Rabet wallet extension is not installed.');
    }
    return rabet;
  }

  async isAvailable(): Promise<boolean> {
    return typeof (window as Window & { rabet?: unknown }).rabet !== 'undefined';
  }

  async connect(): Promise<string> {
    const res = await this.rabet.connect();
    const publicKey = res.publicKey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;
    const res = await this.rabet.connect();
    const publicKey = res.publicKey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const network = opts?.network ?? 'TESTNET';
    return await this.rabet.sign(xdr, network.toLowerCase());
  }
}
