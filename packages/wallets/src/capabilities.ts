/**
 * What each wallet adapter can actually do, published as data.
 *
 * The `WalletAdapter` interface makes `signAuthEntry` and `disconnect`
 * optional, so "does this wallet support X?" is otherwise only answerable by
 * probing the object at the call site — after the UI has already shown a button
 * that may not work. This matrix is the same information in a form a component
 * can read before rendering: a Soroban auth-entry flow can hide itself for a
 * wallet that would raise `NotSupportedError`, and a connect screen can label
 * Ledger as hardware instead of an extension.
 *
 * The values are asserted against the adapters themselves in
 * `capabilities.test.ts`, so a newly implemented (or removed) method cannot
 * leave this table stale.
 */
import type { WalletType } from './WalletProvider.js';

export interface WalletCapabilities {
  /** Provider id, matching the adapter's `id` and `WalletType`. */
  wallet: WalletType;
  /** Human-readable wallet name, matching the adapter's `name`. */
  name: string;
  /** Whether the adapter can only observe and never sign (a watched address). */
  readOnly: boolean;
  /** Whether the adapter implements Soroban auth-entry signing. */
  signAuthEntry: boolean;
  /** Whether the wallet is a hardware device (Ledger) rather than an extension. */
  hardware: boolean;
  /** Whether connecting/signing happens through a web link (Albedo) rather than an injected extension. */
  deepLink: boolean;
}

/**
 * Capability matrix for every supported wallet.
 *
 * - `signAuthEntry`: only Freighter's API exposes auth-entry signing. Albedo,
 *   Rabet, Hana and Ledger raise `NotSupportedError` from
 *   `WalletProvider.signAuthEntry`.
 * - `hardware`: only Ledger signs on a device; the others are extensions or web
 *   wallets, and Ledger additionally requires WebHID.
 * - `deepLink`: Albedo is used through the `@albedo-link/intent` web intent,
 *   which opens Albedo rather than relying on an injected `window` provider.
 * - `readOnly`: only the watch adapter can observe but never sign; write
 *   buttons should be disabled while it is active.
 */
export const WALLET_CAPABILITIES: Record<WalletType, WalletCapabilities> = {
  watch: {
    wallet: 'watch',
    name: 'Watch address',
    readOnly: true,
    signAuthEntry: false,
    hardware: false,
    deepLink: false,
  },
  freighter: {
    wallet: 'freighter',
    name: 'Freighter',
    readOnly: false,
    signAuthEntry: true,
    hardware: false,
    deepLink: false,
  },
  albedo: {
    wallet: 'albedo',
    name: 'Albedo',
    readOnly: false,
    signAuthEntry: false,
    hardware: false,
    deepLink: true,
  },
  rabe: {
    wallet: 'rabe',
    name: 'Rabet',
    readOnly: false,
    signAuthEntry: false,
    hardware: false,
    deepLink: false,
  },
  hana: {
    wallet: 'hana',
    name: 'Hana',
    readOnly: false,
    signAuthEntry: false,
    hardware: false,
    deepLink: false,
  },
  ledger: {
    wallet: 'ledger',
    name: 'Ledger',
    readOnly: false,
    signAuthEntry: false,
    hardware: true,
    deepLink: false,
  },
};

/** Capabilities of one wallet; `null` for an id that is not a supported wallet. */
export function getWalletCapabilities(wallet: WalletType | null): WalletCapabilities | null {
  return wallet ? (WALLET_CAPABILITIES[wallet] ?? null) : null;
}
