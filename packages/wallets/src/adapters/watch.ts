import { StrKey } from '@stellar/stellar-sdk';
import { NotSupportedError } from '../errors.js';
import { type SignTransactionOptions, type WalletAdapter } from './adapter.js';
import type { WalletType } from '../WalletProvider';

/**
 * Read-only adapter that tracks a pasted address without any wallet extension.
 *
 * It never touches `window`, never installs anything, and refuses every signing
 * request, so the dashboard stays usable for read-only tasks (inspecting a
 * stream or a public address) even when no wallet extension is present.
 *
 * # Usage
 *
 * ```typescript
 * const adapter = new WatchAdapter();
 * const address = await adapter.watch('GABC...'); // validates the StrKey
 * await adapter.connect();                         // returns the watched address
 * await adapter.signTransaction('xdr');            // throws: read-only
 * ```
 */
export class WatchAdapter implements WalletAdapter {
  readonly id: WalletType = 'watch';
  readonly name = 'Watch address';

  private address: string | null = null;

  /** Always available — no extension is required to watch an address. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Validates `address` as a Stellar account (`G...`) or contract (`C...`)
   * address and remembers it as the address to watch. Reports availability
   * without an extension.
   *
   * @throws Error when `address` is not a valid StrKey.
   */
  async watch(address: string): Promise<string> {
    if (!StrKey.isValidEd25519PublicKey(address) && !StrKey.isValidContract(address)) {
      throw new Error(
        `Invalid watch address: ${address}. Expected a G... account address or C... contract address.`,
      );
    }
    this.address = address;
    return address;
  }

  /** Returns the watched address, watching `address` first when one is given. */
  async connect(address?: string): Promise<string> {
    if (address !== undefined) {
      return this.watch(address);
    }
    if (this.address === null) {
      throw new Error(
        'No address is being watched. Call watch() with a valid Stellar address first.',
      );
    }
    return this.address;
  }

  /** Returns the watched address. */
  async getPublicKey(): Promise<string> {
    if (this.address === null) {
      throw new Error('No address is being watched. Call watch() and connect() first.');
    }
    return this.address;
  }

  async signTransaction(_xdr: string, _opts?: SignTransactionOptions): Promise<string> {
    throw new NotSupportedError('signTransaction', this.name);
  }

  async signAuthEntry(_entryXdr: string, _opts?: SignTransactionOptions): Promise<string> {
    throw new NotSupportedError('signAuthEntry', this.name);
  }
}
