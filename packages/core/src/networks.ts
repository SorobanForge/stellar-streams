import { KNOWN_NETWORKS } from '@stellar-starter-kit/config';
import type { StellarNetwork } from '@stellar-starter-kit/types';

/**
 * Network configuration registry for all supported Stellar networks.
 * Each network defines its RPC endpoint, Horizon URL, and network passphrase.
 *
 * The data lives in `@stellar-starter-kit/config`, the single source of truth
 * for network endpoints, so the SDK and the dashboard cannot drift apart.
 */
export interface NetworkConfig {
  rpcUrl: string;
  horizonUrl: string;
  passphrase: string;
}

function fromKnownNetwork(network: StellarNetwork): NetworkConfig {
  const config = KNOWN_NETWORKS[network];
  return {
    rpcUrl: config.sorobanRpcUrl,
    horizonUrl: config.horizonUrl,
    passphrase: config.networkPassphrase,
  };
}

export const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  local: fromKnownNetwork('local'),
  testnet: fromKnownNetwork('testnet'),
  mainnet: fromKnownNetwork('mainnet'),
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
