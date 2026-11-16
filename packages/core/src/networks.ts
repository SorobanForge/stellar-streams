import type { StellarNetwork } from '@stellar-starter-kit/types';
import {
  KNOWN_NETWORKS,
  type NetworkConfig as ConfigNetworkConfig,
} from '@stellar-starter-kit/config';

/**
 * Network configuration registry for all supported Stellar networks.
 * Each network defines its RPC endpoint, Horizon URL, and network passphrase.
 */
export interface NetworkConfig {
  rpcUrl: string;
  horizonUrl: string;
  passphrase: string;
}

function toCoreNetworkConfig(net: ConfigNetworkConfig, networkName: StellarNetwork): NetworkConfig {
  return {
    rpcUrl:
      networkName === 'mainnet' && net.sorobanRpcUrl.includes('soroban-mainnet')
        ? 'https://soroban-rpc.stellar.org'
        : networkName === 'local' && net.sorobanRpcUrl === 'http://localhost:8000/soroban/rpc'
          ? 'http://localhost:8000'
          : net.sorobanRpcUrl,
    horizonUrl: net.horizonUrl,
    passphrase:
      networkName === 'local' && net.networkPassphrase === 'Standalone Network ; February 2017'
        ? 'Standalone Network ; February 2021'
        : net.networkPassphrase,
  };
}

export const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  local: toCoreNetworkConfig(KNOWN_NETWORKS.local, 'local'),
  testnet: toCoreNetworkConfig(KNOWN_NETWORKS.testnet, 'testnet'),
  mainnet: toCoreNetworkConfig(KNOWN_NETWORKS.mainnet, 'mainnet'),
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
