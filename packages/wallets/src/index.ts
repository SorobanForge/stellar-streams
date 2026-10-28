// Export Stellar wallets package utilities
import type { WalletType } from './WalletProvider';

/**
 * Every provider the package can connect to. Each value is checked against
 * `WalletType`, so adding a wallet to one place and forgetting the other is a
 * compile error instead of a runtime "Unsupported wallet provider".
 */
export const WALLET_PROVIDERS = {
  FREIGHTER: 'freighter',
  XBULL: 'xbull',
  ALBEDO: 'albedo',
  RABE: 'rabe',
  HANA: 'hana',
  LEDGER: 'ledger',
} as const;

/**
 * Every supported provider, in the order the wallet picker lists them. UIs must
 * render from this list rather than hard-coding a subset, so a newly supported
 * wallet cannot be missing from the picker.
 */
export const WALLET_PROVIDER_OPTIONS: readonly WalletProviderOption[] = [
  { id: WALLET_PROVIDERS.FREIGHTER, label: 'Freighter' },
  { id: WALLET_PROVIDERS.XBULL, label: 'xBull' },
  { id: WALLET_PROVIDERS.ALBEDO, label: 'Albedo' },
  { id: WALLET_PROVIDERS.RABE, label: 'Rabet' },
  { id: WALLET_PROVIDERS.HANA, label: 'Hana' },
];

// Explicit extensions: the emitted dist keeps specifiers as written, and
// Node's ESM resolver rejects extensionless relative imports.
export * from './WalletProvider.js';
export * from './adapters/index.js';
export {
  NotSupportedError,
  WalletCancelledError,
  WalletRejectedError,
  isUserRejection,
  toSigningError,
} from './errors.js';
