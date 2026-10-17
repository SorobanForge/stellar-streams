// Export Stellar wallets package utilities
export const WALLET_PROVIDERS = {
  FREIGHTER: 'freighter',
  ALBEDO: 'albedo',
  RABE: 'rabe',
  HANA: 'hana',
} as const;

export type WalletProviderType = (typeof WALLET_PROVIDERS)[keyof typeof WALLET_PROVIDERS];

export * from './WalletProvider';
export * from './adapters';
