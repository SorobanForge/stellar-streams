'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  AlbedoAdapter,
  FreighterAdapter,
  HanaAdapter,
  RabetAdapter,
  type WalletAdapter,
} from './adapters';

export type WalletType = 'freighter' | 'albedo' | 'rabe' | 'hana' | 'xbull';

/** Passphrase of the Stellar test network. */
export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Passphrase of the Stellar public network. */
export const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

/** Human name of the network behind a passphrase, for user-facing messages. */
export function networkLabelForPassphrase(passphrase: string): string {
  if (passphrase === TESTNET_PASSPHRASE) return 'Testnet';
  if (passphrase === MAINNET_PASSPHRASE) return 'Mainnet';
  return `the "${passphrase}" network`;
}

/**
 * The passphrase a transaction is signed with for a configured `network`.
 * `setNetwork('TESTNET')` selects Testnet; everything else (the default being
 * `MAINNET`) selects the public network.
 */
export function passphraseForNetwork(network: string): string {
  return network === 'TESTNET' ? TESTNET_PASSPHRASE : MAINNET_PASSPHRASE;
}

/** The `setNetwork` value that points the app at a wallet's network. */
export function networkIdForPassphrase(passphrase: string): string {
  return passphrase === MAINNET_PASSPHRASE ? 'MAINNET' : 'TESTNET';
}

/**
 * Explains a wallet/app network mismatch: both networks are named, plus the two
 * ways out (switch the wallet, or re-point the app and reconnect).
 */
export function networkMismatchMessage(
  configuredPassphrase: string,
  walletPassphrase: string,
): string {
  const configuredLabel = networkLabelForPassphrase(configuredPassphrase);
  const walletLabel = networkLabelForPassphrase(walletPassphrase);
  return (
    `Wallet network mismatch: the app is configured for ${configuredLabel} ` +
    `(${configuredPassphrase}) but the connected wallet is on ${walletLabel} ` +
    `(${walletPassphrase}). Switch the wallet to ${configuredLabel} and try again, or call ` +
    `setNetwork('${networkIdForPassphrase(walletPassphrase)}') and reconnect the wallet.`
  );
}

/**
 * Reads the network a wallet reports for itself, for the adapters that support
 * it. Returns the wallet's network passphrase, or `null` when the network cannot
 * be read — Albedo, Rabet and Hana sign for the network they are told to use and
 * expose no way to ask which one is selected.
 */
async function readWalletNetworkPassphrase(provider: WalletType): Promise<string | null> {
  if (provider === 'freighter') {
    try {
      const details = await getFreighterNetworkDetails();
      if (details?.networkPassphrase) return details.networkPassphrase;
    } catch {
      // Freighter builds without `getNetworkDetails` fall through to `getNetwork`.
    }
    try {
      const details = await getFreighterNetwork();
      return details?.networkPassphrase || null;
    } catch {
      return null;
    }
  }

  if (provider === 'xbull') {
    const xbull = window.xBullSDK;
    if (!xbull || !xbull.getNetwork) return null;
    try {
      const res = await xbull.getNetwork();
      if ('error' in res) return null;
      return res?.networkPassphrase || null;
    } catch {
      return null;
    }
  }

  return null;
}

export interface WalletContextType {
  activeAddress: string | null;
  activeProvider: WalletType | null;
  isConnected: boolean;
  isConnecting: boolean;
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
};

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<WalletType | null>(null);
  const [network, setNetworkState] = useState<string>('TESTNET');
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const adapterFor = useCallback((provider: WalletType): WalletAdapter => ADAPTERS[provider], []);

  // Auto-reconnect from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem(LOCAL_STORAGE_KEY_PROVIDER) as WalletType | null;
    const savedAddress = localStorage.getItem(LOCAL_STORAGE_KEY_ADDRESS);

    if (savedProvider && savedAddress) {
      setActiveProvider(savedProvider);
      setActiveAddress(savedAddress);
    }
  }, []);

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
    setActiveAddress(null);
    setActiveProvider(null);
    setWalletNetworkPassphrase(null);
    setError(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY_PROVIDER);
    localStorage.removeItem(LOCAL_STORAGE_KEY_ADDRESS);
  }, []);

  const signTransaction = useCallback(
    async (xdr: string, opts?: { network?: string; networkPassphrase?: string }) => {
      if (!activeProvider || !activeAddress) {
        throw new Error('No active wallet session to sign transaction.');
      }

      const adapter = ADAPTERS[activeProvider];
      const passphrase =
        opts?.networkPassphrase ||
        (network === 'TESTNET'
          ? 'Test SDF Network ; September 2015'
          : 'Public Global Stellar Network ; September 2015');

      try {
        return await adapter.signTransaction(xdr, {
          networkPassphrase: passphrase,
          network,
        });
      } catch (err) {
        let message = 'Failed to sign transaction.';
        if (err instanceof Error) {
          message = err.message;
        } else if (typeof err === 'string') {
          message = err;
        }

        if (
          message.toLowerCase().includes('user rejected') ||
          message.toLowerCase().includes('declined')
        ) {
          console.warn('Transaction signing cancelled by user:', err);
        } else {
          console.error('Transaction signing failed:', err);
        }
        throw new Error(message);
      }
    },
    [activeProvider, activeAddress, network, walletNetworkPassphrase],
  );

  return (
    <WalletContext.Provider
      value={{
        activeAddress,
        activeProvider,
        isConnected: !!activeAddress,
        isConnecting,
        network,
        walletNetworkPassphrase,
        error,
        connect,
        disconnect,
        signTransaction,
        setNetwork: setNetworkState,
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
