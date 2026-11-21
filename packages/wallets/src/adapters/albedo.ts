import type { WalletAdapter, SignTransactionOptions } from './adapter';
import type { WalletType } from '../WalletProvider';

// `@albedo-link/intent` is a UMD bundle, so its client is reached through the
// namespace's `default`. Importing it at module scope would put it in the chunk
// every page downloads before a wallet is chosen, so it is awaited on first use
// instead.
async function albedoClient() {
  const { default: albedo } = await import('@albedo-link/intent');
  return albedo;
}

/** Adapter for the Albedo wallet (@albedo-link/intent). */
export class AlbedoAdapter implements WalletAdapter {
  readonly id: WalletType = 'albedo';
  readonly name = 'Albedo';

  private publicKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    const albedo = await albedoClient();
    return typeof albedo?.publicKey === 'function';
  }

  async connect(): Promise<string> {
    const albedo = await albedoClient();
    const res = await albedo.publicKey({});
    const publicKey = res.pubkey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async getPublicKey(): Promise<string> {
    // Never serve a cached key: restore has to see the account the extension
    // currently holds. The fetched key is still cached for signing.
    const albedo = await albedoClient();
    const res = await albedo.publicKey({});
    const publicKey = res.pubkey;
    if (!publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = publicKey;
    return publicKey;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const albedo = await albedoClient();
    const network = opts?.network ?? 'TESTNET';
    const res = await albedo.tx({
      xdr,
      network: network.toLowerCase(),
    });
    return res.signed_envelope_xdr;
  }
}
