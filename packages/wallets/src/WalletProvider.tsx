'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  AlbedoAdapter,
  FreighterAdapter,
  HanaAdapter,
  LedgerAdapter,
  RabetAdapter,
  type WalletAdapter,
} from './adapters/index.js';
import { isUserRejection, NotSupportedError, toSigningError } from './errors.js';

export type WalletType = 'freighter' | 'albedo' | 'rabe' | 'hana' | 'ledger';

export interface WalletContextType {
  activeAddress: string | null;
  activeProvider: WalletType | null;
  isConnected: boolean;
  isConnecting: boolean;
  isRestoring: boolean;
  network: string;
  /** Network passphrase reported by the connected wallet, or `null` if unreadable. */
  walletNetworkPassphrase: string | null;
  error: string | null;
  connect: (provider: WalletType) => Promise<void>;
  disconnect: () => void;
  signTransaction: (
    xdr: string,
    opts?: { network?: string; networkPassphrase?: string },
  ) => Promise<string>;
  /**
   * Sign a Soroban authorization entry. Rejects with `NotSupportedError` when
   * the active wallet cannot sign auth entries.
   */
  signAuthEntry: (
    entryXdr: string,
    opts?: { network?: string; networkPassphrase?: string },
  ) => Promise<string>;
  setNetwork: (network: string) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY_PROVIDER = 'stellar_starter_kit_wallet_provider';
const LOCAL_STORAGE_KEY_ADDRESS = 'stellar_starter_kit_wallet_address';

/** One adapter per supported wallet, keyed by provider id. */
const ADAPTERS: Record<WalletType, WalletAdapter> = {
  freighter: new FreighterAdapter(),
  albedo: new AlbedoAdapter(),
  rabe: new RabetAdapter(),
  hana: new HanaAdapter(),
  // The adapter only imports Ledger's device packages dynamically, so this does
  // not pull a transport into the default bundle.
  ledger: new LedgerAdapter(),
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<WalletType | null>(null);
  const [network, setNetworkState] = useState<string>('TESTNET');
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  /** True while a persisted session is being verified against the extension. */
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  /** Monotonically increasing id used to discard stale restore results. */
  const restoreId = useRef(0);

  const adapterFor = useCallback((provider: WalletType): WalletAdapter => ADAPTERS[provider], []);

  const connect = useCallback(
    async (provider: WalletType) => {
      setIsConnecting(true);
      setError(null);
      try {
        const adapter = adapterFor(provider);
        const publicKey = await adapter.connect();

        if (!publicKey) {
          throw new Error('Failed to retrieve public key from wallet.');
        }

        setActiveAddress(publicKey);
        setActiveProvider(provider);
        localStorage.setItem(LOCAL_STORAGE_KEY_PROVIDER, provider);
        localStorage.setItem(LOCAL_STORAGE_KEY_ADDRESS, publicKey);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'An unknown error occurred connecting to the wallet.';
        setError(message);
        console.error('Wallet connection error:', err);
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [adapterFor],
  );

  const disconnect = useCallback(() => {
    // Invalidate any in-flight restore so it cannot resurrect this session.
    restoreId.current++;
    const provider = activeProvider;
    setActiveAddress(null);
    setActiveProvider(null);
    setWalletNetworkPassphrase(null);
    setError(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY_PROVIDER);
    localStorage.removeItem(LOCAL_STORAGE_KEY_ADDRESS);

    // Best-effort: adapters without a revoke API (and extensions that are no
    // longer installed) must not keep the local session alive.
    if (provider) {
      void ADAPTERS[provider].disconnect?.().catch((err: unknown) => {
        console.warn('Wallet disconnect failed:', err);
      });
    }
  }, [activeProvider]);

  // Auto-reconnect from localStorage on mount. A persisted session is only
  // reported as connected once the extension confirms it, so an uninstalled
  // wallet or a different browser profile cannot fake a live session.
  useEffect(() => {
    const savedProvider = localStorage.getItem(LOCAL_STORAGE_KEY_PROVIDER) as WalletType | null;
    const savedAddress = localStorage.getItem(LOCAL_STORAGE_KEY_ADDRESS);

    if (!savedProvider || !savedAddress) return;

    const adapter: WalletAdapter | undefined =
      savedProvider in ADAPTERS ? ADAPTERS[savedProvider] : undefined;
    const id = ++restoreId.current;
    let active = true;
    setIsRestoring(true);

    (async () => {
      try {
        if (!adapter) {
          throw new Error(`Unsupported wallet provider: ${savedProvider}`);
        }
        if (!(await adapter.isAvailable().catch(() => false))) {
          throw new Error(`${adapter.name} wallet extension is not available.`);
        }
        const currentKey = await adapter.getPublicKey();

        if (!active || id !== restoreId.current) return;
        if (!currentKey || currentKey !== savedAddress) {
          throw new Error('Stored address does not match the wallet.');
        }

        setActiveProvider(savedProvider);
        setActiveAddress(savedAddress);
      } catch {
        if (!active || id !== restoreId.current) return;
        // Extension missing, disconnected, or unverifiable: clear the stale
        // persisted session and expose the disconnected state. This mirrors
        // `disconnect` without bumping restoreId, so the finally block below
        // can still settle isRestoring.
        setActiveAddress(null);
        setActiveProvider(null);
        setError(null);
        localStorage.removeItem(LOCAL_STORAGE_KEY_PROVIDER);
        localStorage.removeItem(LOCAL_STORAGE_KEY_ADDRESS);
      } finally {
        if (active && id === restoreId.current) setIsRestoring(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /** Signs through the active adapter and logs failures at the right level. */
  const signWith = useCallback(
    async (
      method: 'signTransaction' | 'signAuthEntry',
      xdr: string,
      opts?: { network?: string; networkPassphrase?: string },
    ): Promise<string> => {
      const noun = method === 'signTransaction' ? 'transaction' : 'auth entry';
      if (!activeProvider || !activeAddress) {
        throw new Error(`No active wallet session to sign ${noun}.`);
      }

      const adapter = ADAPTERS[activeProvider];
      const sign = adapter[method];
      if (!sign) {
        throw new NotSupportedError(method, adapter.name);
      }

      const passphrase =
        opts?.networkPassphrase ||
        (network === 'TESTNET'
          ? 'Test SDF Network ; September 2015'
          : 'Public Global Stellar Network ; September 2015');

      try {
        return await sign.call(adapter, xdr, { networkPassphrase: passphrase, network });
      } catch (err) {
        const error = toSigningError(err, `Failed to sign ${noun}.`);
        if (isUserRejection(error.message)) {
          console.warn(`${noun} signing cancelled by user:`, err);
        } else {
          console.error(`${noun} signing failed:`, err);
        }
        throw error;
      }
    },
    [activeProvider, activeAddress, network, walletNetworkPassphrase],
  );

  const signTransaction = useCallback(
    (xdr: string, opts?: { network?: string; networkPassphrase?: string }) =>
      signWith('signTransaction', xdr, opts),
    [signWith],
  );

  const signAuthEntry = useCallback(
    (entryXdr: string, opts?: { network?: string; networkPassphrase?: string }) =>
      signWith('signAuthEntry', entryXdr, opts),
    [signWith],
  );

  return (
    <WalletContext.Provider
      value={{
        activeAddress,
        activeProvider,
        isConnected: !!activeAddress,
        isConnecting,
        isRestoring,
        network,
        walletNetworkPassphrase,
        error,
        connect,
        disconnect,
        signTransaction,
        signAuthEntry,
        setNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
