// Export contracts configurations and utilities
export const SOROBAN_NETWORKS = {
  LOCAL: {
    networkPassphrase: 'Standalone Network ; February 2017',
    rpcUrl: 'http://localhost:8000/soroban/rpc',
  },
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
