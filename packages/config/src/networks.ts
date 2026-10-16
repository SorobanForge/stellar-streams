import { Network, NetworkConfig } from './types.js';

/**
 * Predefined network configurations for known Stellar networks
 */
export const KNOWN_NETWORKS: Record<Network, NetworkConfig> = {
  testnet: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    expertUrl: 'https://stellar.expert/explorer/testnet',
  },
  mainnet: {
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    expertUrl: 'https://stellar.expert/explorer/public',
  },
  local: {
    network: 'local',
    horizonUrl: 'http://localhost:8000',
    sorobanRpcUrl: 'http://localhost:8000/soroban/rpc',
    networkPassphrase: 'Standalone Network ; February 2017',
    expertUrl: 'http://localhost:3000',
  },
};

/**
 * Get the known network configuration for a given passphrase
 * Returns undefined if no matching network is found
 */
export function getNetworkByPassphrase(
  passphrase: string
): Network | undefined {
  for (const [network, config] of Object.entries(KNOWN_NETWORKS)) {
    if (config.networkPassphrase === passphrase) {
      return network as Network;
    }
  }
  return undefined;
}

/**
 * Get the known network configuration for a given RPC URL
 * Returns undefined if no matching network is found
 */
export function getNetworkByRpcUrl(rpcUrl: string): Network | undefined {
  for (const [network, config] of Object.entries(KNOWN_NETWORKS)) {
    if (config.sorobanRpcUrl === rpcUrl) {
      return network as Network;
    }
  }
  return undefined;
}

/**
 * Get the known network configuration for a given Horizon URL
 * Returns undefined if no matching network is found
 */
export function getNetworkByHorizonUrl(horizonUrl: string): Network | undefined {
  for (const [network, config] of Object.entries(KNOWN_NETWORKS)) {
    if (config.horizonUrl === horizonUrl) {
      return network as Network;
    }
  }
  return undefined;
}

/**
 * Check if a passphrase matches the expected network
 */
export function isPassphraseForNetwork(
  passphrase: string,
  network: Network
): boolean {
  return KNOWN_NETWORKS[network].networkPassphrase === passphrase;
}

/**
 * Check if an RPC URL matches the expected network
 */
export function isRpcUrlForNetwork(rpcUrl: string, network: Network): boolean {
  return KNOWN_NETWORKS[network].sorobanRpcUrl === rpcUrl;
}

/**
 * Check if a Horizon URL matches the expected network
 */
export function isHorizonUrlForNetwork(
  horizonUrl: string,
  network: Network
): boolean {
  return KNOWN_NETWORKS[network].horizonUrl === horizonUrl;
}
