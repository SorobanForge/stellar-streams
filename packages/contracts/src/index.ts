// Export contracts configurations and utilities
/**
 * Interface version reported by every contract's `version()` view.
 *
 * Mirrors `CONTRACT_VERSION` in `contracts/version/src/lib.rs`. Bump both in
 * the same change so the dashboard footer and the contracts never disagree.
 */
export const CONTRACT_VERSION = 1;

export const SOROBAN_NETWORKS = {
  TESTNET: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  },
  MAINNET: {
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    rpcUrl: 'https://soroban-rpc.stellar.org',
  },
} as const;

// Generated TypeScript clients, one directory per contract under `./generated`.
// Regenerate them from the locally built WASM (no deploy required) with:
//   pnpm run generate:bindings
//
// Each binding was generated from the WASM recorded below:
//   escrow -> contracts/target/wasm32v1-none/release/escrow.wasm
//   stream -> contracts/target/wasm32v1-none/release/stream.wasm
//   splits -> contracts/target/wasm32v1-none/release/splits.wasm
export * as EscrowClient from './generated/escrow/src';
export * as StreamClient from './generated/stream/src';
export * as SplitsClient from './generated/splits/src';
