'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// @stellar/freighter-api ships CommonJS, so a default import is the only form
// Node's ESM resolver can load; named imports from it work under a bundler but
// throw at runtime everywhere else.
import freighterApi from '@stellar/freighter-api';

const {
  isConnected: checkFreighterConnected,
  getAddress: getFreighterAddress,
  signTransaction: signFreighterTransaction,
  requestAccess: requestFreighterAccess,
} = freighterApi;
import albedo from '@albedo-link/intent';

interface RabetInterface {
  connect: () => Promise<{ publicKey: string }>;
  sign: (xdr: string, network: string) => Promise<string>;
}

interface HanaInterface {
  send: (
    method: string,
    params?: { xdr: string; network: string },
  ) => Promise<{ publicKey?: string; signedTransaction?: string } | string>;
}

declare global {
  interface Window {
    rabet?: RabetInterface;
    hanaWallet?: HanaInterface;
  }
}

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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<WalletType | null>(null);
  const [network, setNetwork] = useState<string>('TESTNET');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-reconnect from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem(LOCAL_STORAGE_KEY_PROVIDER) as WalletType | null;
    const savedAddress = localStorage.getItem(LOCAL_STORAGE_KEY_ADDRESS);

    if (savedProvider && savedAddress) {
      setActiveProvider(savedProvider);
      setActiveAddress(savedAddress);
    }
  }, []);

  const connect = useCallback(async (provider: WalletType) => {
    setIsConnecting(true);
    setError(null);
    try {
      let publicKey = '';
      if (provider === 'freighter') {
        const connection = await checkFreighterConnected();
        if (!connection.isConnected) {
          throw new Error('Freighter wallet extension is not installed or enabled.');
        }
        try {
          const access = await requestFreighterAccess();
          publicKey = access.address;
        } catch {
          const address = await getFreighterAddress();
          publicKey = address.address;
        }
      } else if (provider === 'albedo') {
        const res = await albedo.publicKey({});
        publicKey = res.pubkey;
      } else if (provider === 'rabe') {
        const rabet = window.rabet;
        if (!rabet) {
          throw new Error('Rabet wallet extension is not installed.');
        }
        const res = await rabet.connect();
        publicKey = res.publicKey;
      } else if (provider === 'hana') {
        const hana = window.hanaWallet;
        if (!hana) {
          throw new Error('Hana wallet extension is not installed.');
        }
        const res = await hana.send('stellar:getPublicKey');
        publicKey = typeof res === 'string' ? res : res.publicKey || '';
      } else {
        throw new Error(`Unsupported wallet provider: ${provider}`);
      }

      if (!publicKey) {
        throw new Error('Failed to retrieve public key from wallet.');
      }

      setActiveAddress(publicKey);
      setActiveProvider(provider);
      localStorage.setItem(LOCAL_STORAGE_KEY_PROVIDER, provider);
      localStorage.setItem(LOCAL_STORAGE_KEY_ADDRESS, publicKey);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unknown error occurred connecting to the wallet.';
      setError(message);
      console.error('Wallet connection error:', err);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

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

      const passphrase =
        opts?.networkPassphrase ||
        (network === 'TESTNET'
          ? 'Test SDF Network ; September 2015'
          : 'Public Global Stellar Network ; September 2015');

      try {
        if (activeProvider === 'freighter') {
          const { signedTxXdr } = await signFreighterTransaction(xdr, {
            networkPassphrase: passphrase,
            address: activeAddress,
          });
          return signedTxXdr;
        } else if (activeProvider === 'albedo') {
          const res = await albedo.tx({
            xdr,
            network: network.toLowerCase(),
          });
          return res.signed_envelope_xdr;
        } else if (activeProvider === 'rabe') {
          const rabet = window.rabet;
          if (!rabet) throw new Error('Rabet extension is missing.');
          return await rabet.sign(xdr, network.toLowerCase());
        } else if (activeProvider === 'hana') {
          const hana = window.hanaWallet;
          if (!hana) throw new Error('Hana extension is missing.');
          const res = await hana.send('stellar:signTransaction', {
            xdr,
            network: network.toLowerCase(),
          });
          return typeof res === 'string' ? res : res.signedTransaction || '';
        } else {
          throw new Error(`Signer not implemented for: ${activeProvider}`);
        }
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
