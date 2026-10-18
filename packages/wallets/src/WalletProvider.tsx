'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  isConnected as checkFreighterConnected,
  getAddress as getFreighterAddress,
  signTransaction as signFreighterTransaction,
  requestAccess as requestFreighterAccess,
} from '@stellar/freighter-api';
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
  /**
   * True while a stored session is being re-authorized on load. While it is
   * true the wallet is neither connected nor known to be unavailable, so
   * connect buttons should stay disabled instead of flashing.
   */
  isCheckingWallet: boolean;
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

/**
 * Asks a wallet for an address for this session and returns it, or an empty
 * string when the wallet answered without granting access.
 *
 * Granting access can prompt the user (Freighter's `requestAccess`, Albedo's
 * `publicKey`, Rabet's `connect`, Hana's `getPublicKey`); every failure mode —
 * extension missing, request refused, request errored — throws, so callers can
 * treat "not granted" uniformly. This is the single place an address is read
 * from a wallet, shared by `connect` and the session re-authorization on load.
 */
async function requestAddress(provider: WalletType): Promise<string> {
  if (provider === 'freighter') {
    const connection = await checkFreighterConnected();
    if (!connection.isConnected) {
      throw new Error('Freighter wallet extension is not installed or enabled.');
    }
    try {
      const access = await requestFreighterAccess();
      return access.address ?? '';
    } catch {
      // Older Freighter builds reject when access was already granted.
      const address = await getFreighterAddress();
      return address.address ?? '';
    }
  }
  if (provider === 'albedo') {
    const res = await albedo.publicKey({});
    return res.pubkey ?? '';
  }
  if (provider === 'rabe') {
    const rabet = window.rabet;
    if (!rabet) {
      throw new Error('Rabet wallet extension is not installed.');
    }
    const res = await rabet.connect();
    return res.publicKey ?? '';
  }
  if (provider === 'hana') {
    const hana = window.hanaWallet;
    if (!hana) {
      throw new Error('Hana wallet extension is not installed.');
    }
    const res = await hana.send('stellar:getPublicKey');
    return (typeof res === 'string' ? res : res.publicKey) ?? '';
  }
  throw new Error(`Unsupported wallet provider: ${provider}`);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<WalletType | null>(null);
  const [network, setNetwork] = useState<string>('TESTNET');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    setActiveAddress(null);
    setActiveProvider(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY_PROVIDER);
    localStorage.removeItem(LOCAL_STORAGE_KEY_ADDRESS);
  }, []);

  // Re-authorize the stored session on mount: a saved address is evidence the
  // user connected once, not proof the wallet still grants access in this
  // session. The address is only shown as connected once the wallet actually
  // grants it; a denial or a missing extension falls back to disconnected
  // without an error banner, because the user never asked to connect.
  useEffect(() => {
    const savedProvider = localStorage.getItem(LOCAL_STORAGE_KEY_PROVIDER) as WalletType | null;
    const savedAddress = localStorage.getItem(LOCAL_STORAGE_KEY_ADDRESS);

    if (!savedProvider || !savedAddress) return;

    let cancelled = false;
    setIsCheckingWallet(true);

    void (async () => {
      try {
        const granted = await requestAddress(savedProvider);
        if (cancelled) return;
        if (!granted) {
          clearSession();
          return;
        }
        setActiveProvider(savedProvider);
        setActiveAddress(granted);
        localStorage.setItem(LOCAL_STORAGE_KEY_ADDRESS, granted);
      } catch {
        if (cancelled) return;
        clearSession();
      } finally {
        if (!cancelled) setIsCheckingWallet(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const connect = useCallback(async (provider: WalletType) => {
    setIsConnecting(true);
    setError(null);
    try {
      const publicKey = await requestAddress(provider);
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
    setError(null);
    clearSession();
  }, [clearSession]);

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
        isCheckingWallet,
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
