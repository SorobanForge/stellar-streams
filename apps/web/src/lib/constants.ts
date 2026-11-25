/**
 * Canonical repository location, shared by every component that links to
 * GitHub. The UI package owns the constant because its Header and Footer use
 * it; this re-export keeps app-side imports stable.
 *
 * Network, explorer and contract-id defaults live in
 * `@stellar-starter-kit/config` and are read through `src/lib/environment.ts`.
 * Do not add a fallback for one of those here: a page-local default is exactly
 * the silent Testnet fallback the config package exists to prevent.
 */
export { REPO_URL } from '@stellar-starter-kit/ui';
