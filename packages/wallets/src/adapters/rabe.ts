import type { WalletAdapter, SignTransactionOptions } from './adapter';
import type { WalletType } from '../WalletProvider';
import { WalletCancelledError, WalletRejectedError } from '../errors';

interface RabetInterface {
  connect: () => Promise<{ publicKey: string }>;
  sign: (xdr: string, network: string) => Promise<string>;
  disconnect?: () => Promise<void>;
}

declare global {
  interface Window {
    rabet?: RabetInterface;
  }
}

/** Pulls a readable message out of whatever shape Rabet rejected with. */
function rabetErrorMessage(err: unknown): string {
  if (typeof err === 'string' && err) return err;
  if (err && typeof err === 'object') {
    const { message, error } = err as { message?: unknown; error?: unknown };
    if (typeof message === 'string' && message) return message;
    if (typeof error === 'string' && error) return error;
  }
  return 'Failed to sign transaction.';
}

/**
 * Rabet rejects signing with an untyped payload, so the extension's message is
 * the only signal available. Map it onto the typed errors callers rely on to
 * tell a deliberate rejection from a dismissed prompt; anything else keeps its
 * message and stays a plain `Error`.
 */
export function toRabetSigningError(err: unknown): Error {
  const message = rabetErrorMessage(err);
  const normalized = message.toLowerCase();

  if (normalized.includes('reject') || normalized.includes('denied')) {
    return new WalletRejectedError(message, { cause: err });
  }
  if (
    normalized.includes('cancel') ||
    normalized.includes('closed') ||
    normalized.includes('dismiss') ||
    normalized.includes('abort')
  ) {
    return new WalletCancelledError(message, { cause: err });
  }
  return new Error(message, { cause: err });
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
    // Never serve a cached key: restore has to see the account the extension
    // currently holds. The fetched key is still cached for signing.
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
    try {
      return await this.rabet.sign(xdr, network.toLowerCase());
    } catch (err) {
      throw toRabetSigningError(err);
    }
  }

  async disconnect(): Promise<void> {
    // Clear the cached key even when the extension is gone, so a later
    // `connect` cannot sign with a stale account.
    this.publicKey = null;
    const rabet = (window as Window & { rabet?: RabetInterface }).rabet;
    await rabet?.disconnect?.();
  }
}
