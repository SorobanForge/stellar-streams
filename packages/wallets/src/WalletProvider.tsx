'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  AlbedoAdapter,
  FreighterAdapter,
  HanaAdapter,
  RabetAdapter,
  type WalletAdapter,
} from './adapters';

export type WalletType = 'freighter' | 'albedo' | 'rabe' | 'hana';

export interface WalletContextType {
  activeAddress: string | null;
  activeProvider: WalletType | null;
  isConnected: boolean;
  isConnecting: boolean;
  network: string;
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
  const [network, setNetwork] = useState<string>('TESTNET');
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
    [activeProvider, activeAddress, network],
  );

  return (
    <WalletContext.Provider
      value={{
        activeAddress,
        activeProvider,
        isConnected: !!activeAddress,
        isConnecting,
        network,
        error,
        connect,
        disconnect,
        signTransaction,
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
