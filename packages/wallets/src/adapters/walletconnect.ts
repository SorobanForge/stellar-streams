/**
 * WalletConnect v2 mobile wallet adapter for Stellar / Soroban.
 *
 * Implements WalletAdapter over WalletConnect v2 SignClient protocol, enabling
 * mobile wallets (e.g. Lobstr, Solar, etc.) to connect via QR code / deep links
 * and sign transactions or Soroban authorization entries adhering to SEP-0043 / SEP-0007.
 */
import {
  PUBLIC_NETWORK_PASSPHRASE,
  resolveNetworkPassphrase,
  type SignTransactionOptions,
  type WalletAdapter,
} from './adapter.js';
import type { WalletType } from '../WalletProvider.js';
import { WalletCancelledError, WalletRejectedError } from '../errors.js';

export const STELLAR_CHAIN_TESTNET = 'stellar:testnet';
export const STELLAR_CHAIN_PUBKEY = 'stellar:pubnet';

export interface WalletConnectSessionProposal {
  uri?: string;
  approval: () => Promise<WalletConnectSession>;
}

export interface WalletConnectSession {
  topic: string;
  namespaces: Record<
    string,
    {
      accounts: string[];
      methods: string[];
      events: string[];
    }
  >;
}

export interface WalletConnectClient {
  session: {
    getAll: () => WalletConnectSession[];
    get: (topic: string) => WalletConnectSession;
  };
  connect: (params: {
    requiredNamespaces: Record<
      string,
      {
        chains: string[];
        methods: string[];
        events: string[];
      }
    >;
  }) => Promise<WalletConnectSessionProposal>;
  request: <T = unknown>(params: {
    topic: string;
    chainId: string;
    request: {
      method: string;
      params: unknown;
    };
  }) => Promise<T>;
  disconnect: (params: {
    topic: string;
    reason: { code: number; message: string };
  }) => Promise<void>;
}

export type WalletConnectClientLoader = () => Promise<WalletConnectClient>;

export interface WalletConnectAdapterOptions {
  projectId?: string;
  clientLoader?: WalletConnectClientLoader;
  onUri?: (uri: string) => void;
}

const LOCAL_STORAGE_WC_TOPIC = 'stellar_streams_wc_topic';

/** Parses the account address from a CAIP-10 formatted string (e.g., "stellar:pubnet:G..."). */
export function parseCaip10Address(caip10String: string): string {
  const parts = caip10String.split(':');
  return parts.length === 3 ? parts[2] : caip10String;
}

/** Translates network passphrases or names to Stellar CAIP-2 chain identifiers. */
export function toStellarChainId(opts?: SignTransactionOptions): string {
  const passphrase = resolveNetworkPassphrase(opts);
  if (passphrase === PUBLIC_NETWORK_PASSPHRASE) {
    return STELLAR_CHAIN_PUBKEY;
  }
  return STELLAR_CHAIN_TESTNET;
}

export class WalletConnectAdapter implements WalletAdapter {
  readonly id: WalletType = 'walletconnect' as WalletType;
  readonly name = 'WalletConnect';

  private client: WalletConnectClient | null = null;
  private session: WalletConnectSession | null = null;
  private publicKey: string | null = null;

  private readonly projectId: string;
  private readonly clientLoader?: WalletConnectClientLoader;
  private readonly onUri?: (uri: string) => void;

  constructor(options: WalletConnectAdapterOptions = {}) {
    this.projectId = options.projectId ?? 'c4f79cc821944d9680842e34466bfbd';
    this.clientLoader = options.clientLoader;
    this.onUri = options.onUri;
  }

  private async getClient(): Promise<WalletConnectClient> {
    if (this.client) return this.client;
    if (this.clientLoader) {
      this.client = await this.clientLoader();
      return this.client;
    }

    // Dynamic loader for production bundlers
    try {
      const { SignClient } = await import('@walletconnect/sign-client');
      const client = await (
        SignClient as unknown as {
          init: (opts: { projectId: string; metadata?: unknown }) => Promise<WalletConnectClient>;
        }
      ).init({
        projectId: this.projectId,
        metadata: {
          name: 'Stellar Streams',
          description: 'Payment streaming and vesting on Stellar & Soroban',
          url:
            typeof window !== 'undefined' ? window.location.origin : 'https://stellar-streams.app',
          icons: ['https://stellar-streams.app/icon.png'],
        },
      });
      this.client = client;
      return client;
    } catch (err) {
      throw new Error('WalletConnect client could not be loaded.', { cause: err });
    }
  }

  async isAvailable(): Promise<boolean> {
    // WalletConnect bridge is always available in browser environments
    return typeof window !== 'undefined';
  }

  async connect(): Promise<string> {
    const client = await this.getClient();

    // Check for existing active sessions to reuse
    const activeSessions = client.session.getAll();
    if (activeSessions.length > 0) {
      const existing = activeSessions[activeSessions.length - 1];
      const accounts = existing.namespaces['stellar']?.accounts ?? [];
      if (accounts.length > 0) {
        this.session = existing;
        this.publicKey = parseCaip10Address(accounts[0]);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_WC_TOPIC, existing.topic);
        }
        return this.publicKey;
      }
    }

    const { uri, approval } = await client.connect({
      requiredNamespaces: {
        stellar: {
          chains: [STELLAR_CHAIN_TESTNET, STELLAR_CHAIN_PUBKEY],
          methods: ['stellar_signXDR', 'stellar_signTransaction', 'stellar_signAuthEntry'],
          events: [],
        },
      },
    });

    if (uri && this.onUri) {
      this.onUri(uri);
    }

    try {
      this.session = await approval();
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes('reject') || msg.includes('user disapproved')) {
        throw new WalletRejectedError('WalletConnect connection rejected by user.');
      }
      if (msg.includes('cancel') || msg.includes('timeout') || msg.includes('expired')) {
        throw new WalletCancelledError('WalletConnect connection was cancelled or timed out.');
      }
      throw err;
    }

    const accounts = this.session.namespaces['stellar']?.accounts ?? [];
    if (!accounts.length) {
      throw new Error('No Stellar accounts found in WalletConnect session.');
    }

    this.publicKey = parseCaip10Address(accounts[0]);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_WC_TOPIC, this.session.topic);
    }

    return this.publicKey;
  }

  async getPublicKey(): Promise<string> {
    if (this.publicKey) return this.publicKey;

    // Attempt restoring session from storage
    if (typeof localStorage !== 'undefined') {
      const storedTopic = localStorage.getItem(LOCAL_STORAGE_WC_TOPIC);
      if (storedTopic) {
        try {
          const client = await this.getClient();
          const session = client.session.get(storedTopic);
          if (session) {
            const accounts = session.namespaces['stellar']?.accounts ?? [];
            if (accounts.length > 0) {
              this.session = session;
              this.publicKey = parseCaip10Address(accounts[0]);
              return this.publicKey;
            }
          }
        } catch {
          localStorage.removeItem(LOCAL_STORAGE_WC_TOPIC);
        }
      }
    }

    return this.connect();
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (!this.session) {
      await this.connect();
    }
    if (!this.session) {
      throw new Error('No active WalletConnect session to sign transaction.');
    }

    const client = await this.getClient();
    const chainId = toStellarChainId(opts);

    try {
      const response = await client.request<{ signedXDR?: string; xdr?: string } | string>({
        topic: this.session.topic,
        chainId,
        request: {
          method: 'stellar_signXDR',
          params: {
            xdr,
            networkPassphrase: resolveNetworkPassphrase(opts),
          },
        },
      });

      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') {
        return response.signedXDR || response.xdr || '';
      }
      throw new Error('Unexpected response format from WalletConnect bridge.');
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes('reject') || msg.includes('user disapproved') || msg.includes('denied')) {
        throw new WalletRejectedError('Transaction signing rejected by user.', { cause: err });
      }
      if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) {
        throw new WalletCancelledError('Transaction signing cancelled.', { cause: err });
      }
      throw err;
    }
  }

  async signAuthEntry(entryXdr: string, opts?: SignTransactionOptions): Promise<string> {
    if (!this.session) {
      await this.connect();
    }
    if (!this.session) {
      throw new Error('No active WalletConnect session to sign auth entry.');
    }

    const client = await this.getClient();
    const chainId = toStellarChainId(opts);

    try {
      const response = await client.request<
        { signedAuthEntry?: string; entryXdr?: string } | string
      >({
        topic: this.session.topic,
        chainId,
        request: {
          method: 'stellar_signAuthEntry',
          params: {
            entryXdr,
            networkPassphrase: resolveNetworkPassphrase(opts),
          },
        },
      });

      if (typeof response === 'string') return response;
      if (response && typeof response === 'object') {
        return response.signedAuthEntry || response.entryXdr || '';
      }
      throw new Error('Unexpected response format from WalletConnect auth entry signing.');
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes('reject') || msg.includes('user disapproved') || msg.includes('denied')) {
        throw new WalletRejectedError('Auth entry signing rejected by user.', { cause: err });
      }
      if (msg.includes('cancel') || msg.includes('dismiss') || msg.includes('abort')) {
        throw new WalletCancelledError('Auth entry signing cancelled.', { cause: err });
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.session && this.client) {
      try {
        await this.client.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: 'User disconnected session',
          },
        });
      } catch {
        // Safe to ignore if session already ended on peer
      }
    }

    this.session = null;
    this.publicKey = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_WC_TOPIC);
    }
  }
}
