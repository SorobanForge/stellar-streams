// Export Stellar wallets package utilities
export const WALLET_PROVIDERS = {
  FREIGHTER: 'freighter',
  ALBEDO: 'albedo',
  RABE: 'rabe',
  HANA: 'hana',
} as const;

export type WalletProviderType = (typeof WALLET_PROVIDERS)[keyof typeof WALLET_PROVIDERS];

// Explicit extensions: the emitted dist keeps specifiers as written, and
// Node's ESM resolver rejects extensionless relative imports.
export * from './WalletProvider.js';
export * from './adapters/index.js';
