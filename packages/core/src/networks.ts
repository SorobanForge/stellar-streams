import type { StellarNetwork } from '@stellar-starter-kit/types';

/**
 * Network configuration registry for all supported Stellar networks.
 * Each network defines its RPC endpoint, Horizon URL, and network passphrase.
 */
export interface NetworkConfig {
  rpcUrl: string;
  horizonUrl: string;
  passphrase: string;
}

export const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  local: {
    rpcUrl: 'http://localhost:8000',
    horizonUrl: 'http://localhost:8000',
    passphrase: 'Standalone Network ; February 2021',
  },
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://soroban-rpc.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

/**
 * Retrieve the network configuration for a given network name.
 * Throws an error if the network is not recognized.
 */
export function getNetworkConfig(network: StellarNetwork): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}`);
  }
  return config;
}
