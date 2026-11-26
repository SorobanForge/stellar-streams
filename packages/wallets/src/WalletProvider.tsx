'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  networkMismatchMessage,
  PUBLIC_NETWORK_PASSPHRASE,
  TESTNET_PASSPHRASE,
  type WalletAdapter,
} from './adapters/adapter.js';
import type { WatchAdapter } from './adapters/watch.js';
import { isUserRejection, NotSupportedError, toSigningError } from './errors.js';
import { getWalletCapabilities, type WalletCapabilities } from './capabilities.js';

export type WalletType = 'watch' | 'freighter' | 'albedo' | 'rabe' | 'hana' | 'ledger' | 'xbull';

export { networkMismatchMessage, PUBLIC_NETWORK_PASSPHRASE, TESTNET_PASSPHRASE };
export const MAINNET_PASSPHRASE = PUBLIC_NETWORK_PASSPHRASE;

/** Provider operations that can fail and be reported. */
export type WalletOperation = 'connect' | 'signTransaction' | 'signAuthEntry';

/**
 * Failure handed to the injectable reporter. It deliberately carries only the
 * adapter id, the operation and the error: never the XDR being signed, a
 * signature or any other secret.
 */
export interface WalletErrorContext {
  adapter: WalletType;
  operation: WalletOperation;
  error: unknown;
}

export type WalletErrorReporter = (context: WalletErrorContext) => void;

export interface WalletProviderProps {
  children: React.ReactNode;
  /** Receives adapter failures for telemetry. Falls back to a console warning. */
  onError?: WalletErrorReporter;
}

export interface WalletContextType {
  activeAddress: string | null;
  activeProvider: WalletType | null;
  /**
   * Capabilities of the active wallet, or `null` when no wallet is connected.
   * Read this before offering a wallet-specific action (for example an
   * auth-entry signature) instead of waiting for the call to fail.
   */
  capabilities: WalletCapabilities | null;
  /**
   * True when the active wallet can only observe and never sign (the watch
   * address adapter). Write buttons should be disabled while this is true.
   */
  readOnly: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  isRestoring: boolean;
  network: string;
  /** Network passphrase reported by the connected wallet, or `null` if unreadable. */
  walletNetworkPassphrase: string | null;
  error: string | null;
  connect: (provider: WalletType, address?: string) => Promise<void>;
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

/**
 * Loads an adapter — and with it the wallet SDK that adapter wraps — only when
 * a page actually uses that provider. A static registry here would pull
 * Freighter's and Albedo's clients into the chunk every page downloads on
 * mount; `import()` makes each one a separate chunk instead. Ledger's device
 * transports are deferred further, inside the adapter's own connect path.
 */
const ADAPTER_LOADERS: Record<WalletType, () => Promise<WalletAdapter>> = {
  // Read-only: no extension required, never signs. Write buttons are disabled
  // while it is active via `readOnly`.
  watch: async () => new (await import('./adapters/watch.js')).WatchAdapter(),
  freighter: async () => new (await import('./adapters/freighter.js')).FreighterAdapter(),
  albedo: async () => new (await import('./adapters/albedo.js')).AlbedoAdapter(),
  rabe: async () => new (await import('./adapters/rabe.js')).RabetAdapter(),
  hana: async () => new (await import('./adapters/hana.js')).HanaAdapter(),
  ledger: async () => new (await import('./adapters/ledger.js')).LedgerAdapter(),
  xbull: async () => new (await import('./adapters/xbull.js')).XBullAdapter(),
};

/**
 * One adapter instance per provider, created on first use and reused: adapters
 * hold session state on the instance (the account a signature is made for,
 * Ledger's open transport), so connecting, signing and disconnecting have to
 * share one object.
 */
const adapterInstances = new Map<WalletType, Promise<WalletAdapter>>();

/** Resolves the adapter for a provider, loading its module on first use. */
function adapterFor(provider: WalletType): Promise<WalletAdapter> {
  const cached = adapterInstances.get(provider);
  if (cached) return cached;
  // A failed load (an offline client cannot fetch its chunk) must not stick.
  const pending = ADAPTER_LOADERS[provider]().catch((err: unknown) => {
    if (adapterInstances.get(provider) === pending) adapterInstances.delete(provider);
    throw err;
  });
  adapterInstances.set(provider, pending);
  return pending;
}

/** Whether a persisted provider id names a wallet this package can load. */
function isWalletProvider(value: string): value is WalletType {
  return value in ADAPTER_LOADERS;
}

export function WalletProvider({ children, onError }: WalletProviderProps) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<WalletType | null>(null);
  const [network, setNetworkState] = useState<string>('TESTNET');
  const networkRef = useRef(network);
  const setNetwork = useCallback((nextNetwork: string) => {
    networkRef.current = nextNetwork;
    setNetworkState(nextNetwork);
  }, []);
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  /** True while a persisted session is being verified against the extension. */
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  /** Monotonically increasing id used to discard stale restore results. */
  const restoreId = useRef(0);

  const reportError = useCallback(
    ({ adapter, operation, error }: WalletErrorContext) => {
      if (onError) {
        onError({ adapter, operation, error });
        return;
      }

      if (operation === 'connect') {
        console.warn('Wallet connection error:', error);
        return;
      }

      const noun = operation === 'signTransaction' ? 'transaction' : 'auth entry';
      if (isUserRejection(error instanceof Error ? error.message : '')) {
        console.warn(`${noun} signing cancelled by user:`, error);
      } else {
        console.warn(`${noun} signing failed:`, error);
      }
    },
    [onError],
  );

  const connect = useCallback(
    async (provider: WalletType, address?: string) => {
      setIsConnecting(true);
      setError(null);
      try {
        const adapter = await adapterFor(provider);
        const publicKey = await adapter.connect(address);

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
        reportError({ adapter: provider, operation: 'connect', error: err });
        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [reportError],
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
      void adapterFor(provider)
        .then((adapter) => adapter.disconnect?.())
        .catch((err: unknown) => {
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

    const knownProvider = isWalletProvider(savedProvider) ? savedProvider : null;
    const id = ++restoreId.current;
    let active = true;
    setIsRestoring(true);

    (async () => {
      try {
        if (!knownProvider) {
          throw new Error(`Unsupported wallet provider: ${savedProvider}`);
        }
        // Only the persisted provider's module is loaded here; the other
        // adapters and their SDKs stay out of this page's initial chunk.
        const adapter = await adapterFor(knownProvider);
        if (!(await adapter.isAvailable().catch(() => false))) {
          throw new Error(`${adapter.name} wallet extension is not available.`);
        }
        // A fresh WatchAdapter has no in-memory address to confirm. There is
        // no extension to revoke a watch session, so re-watch the persisted
        // address (which re-validates the StrKey) before checking it.
        if (knownProvider === 'watch') {
          await (adapter as WatchAdapter).watch(savedAddress);
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

  useEffect(() => {
    if (!activeProvider) {
      setWalletNetworkPassphrase(null);
      return;
    }
    let cancelled = false;
    void adapterFor(activeProvider)
      .then((adapter) => adapter.getNetworkPassphrase?.() ?? null)
      .then((passphrase) => {
        if (!cancelled) setWalletNetworkPassphrase(passphrase);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProvider, network]);

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

      const adapter = await adapterFor(activeProvider);
      const sign = adapter[method];
      if (!sign) {
        throw new NotSupportedError(method, adapter.name);
      }

      const passphrase =
        opts?.networkPassphrase ||
        (networkRef.current === 'TESTNET' ? TESTNET_PASSPHRASE : PUBLIC_NETWORK_PASSPHRASE);

      if (walletNetworkPassphrase && walletNetworkPassphrase !== passphrase) {
        throw new Error(networkMismatchMessage(passphrase, walletNetworkPassphrase));
      }

      try {
        return await sign.call(adapter, xdr, {
          networkPassphrase: passphrase,
          network: networkRef.current,
        });
      } catch (err) {
        const error = toSigningError(err, `Failed to sign ${noun}.`);
        reportError({ adapter: activeProvider, operation: method, error });
        throw error;
      }
    },
    [activeProvider, activeAddress, network, walletNetworkPassphrase, reportError],
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

  // Derived from the active provider so the context value can never drift from
  // the adapter that actually signs.
  const capabilities = getWalletCapabilities(activeProvider);

  const readOnly = capabilities?.readOnly ?? false;

  return (
    <WalletContext.Provider
      value={{
        activeAddress,
        activeProvider,
        capabilities,
        readOnly,
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
