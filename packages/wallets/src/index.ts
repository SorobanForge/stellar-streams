// Export Stellar wallets package utilities
export const WALLET_PROVIDERS = {
  FREIGHTER: 'freighter',
  ALBEDO: 'albedo',
  RABE: 'rabe',
  HANA: 'hana',
} as const;

export type WalletProviderType = (typeof WALLET_PROVIDERS)[keyof typeof WALLET_PROVIDERS];

// Explicit extension: the emitted dist keeps the specifier as written, and
// Node's ESM resolver rejects an extensionless relative import.
export * from './WalletProvider.js';
