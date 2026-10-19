import albedo from '@albedo-link/intent';
import type { WalletAdapter, SignTransactionOptions } from './adapter';
import type { WalletType } from '../WalletProvider';

/** Adapter for the Albedo wallet (@albedo-link/intent). */
export class AlbedoAdapter implements WalletAdapter {
  readonly id: WalletType = 'albedo';
  readonly name = 'Albedo';

  private publicKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    return typeof albedo?.publicKey === 'function';
  }

  async connect(): Promise<string> {
    const res = await albedo.publicKey({});
    const publicKey = res.pubkey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;
    const res = await albedo.publicKey({});
    const publicKey = res.pubkey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const network = opts?.network ?? 'TESTNET';
    const res = await albedo.tx({
      xdr,
      network: network.toLowerCase(),
    });
    return res.signed_envelope_xdr;
  }
}
