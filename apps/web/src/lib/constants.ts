/**
 * Canonical repository location, shared by every component that links to
 * GitHub. The UI package owns the constant because its Header and Footer use
 * it; this re-export keeps app-side imports stable.
 */
export { REPO_URL } from '@stellar-starter-kit/ui';

/**
 * Defaults used only when the matching `NEXT_PUBLIC_*` variable is unset.
 * Keeping them here (rather than inline in a page) means every page falls back
 * to the same network, and a page can be checked for hardcoded endpoints.
 * `NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing
 * one.
 */
export const DEFAULT_STELLAR_NETWORK = 'testnet';
export const DEFAULT_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
export const DEFAULT_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
/** Testnet native XLM SAC; any SEP-41 token contract id can override it. */
export const DEFAULT_TOKEN_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
/** Base explorer URL, including the network segment (testnet by default). */
export const DEFAULT_STELLAR_EXPERT_URL = 'https://stellar.expert/explorer/testnet';
