import type { WalletAdapter } from '@stellar-streams/wallets';

export type WriteStatus = 'simulating' | 'signing' | 'submitting' | 'polling' | 'confirmed' | 'failed';
export type OnStatusChangeCallback = (status: WriteStatus, error?: unknown) => void;

export interface ClientOptions {
  rpcUrl?: string;
  networkPassphrase?: string;
  wallet?: WalletAdapter;
  onStatusChange?: OnStatusChangeCallback;
  retryAttempts?: number;
  retryBaseDelayMs?: number;
}

export interface WriteOptions {
  onStatusChange?: OnStatusChangeCallback;
  signal?: AbortSignal;
}
