import { SOROBAN_NETWORKS } from './index';
import type { StellarNetwork } from '@stellar-starter-kit/types';

export type NetworkName = keyof typeof SOROBAN_NETWORKS;

export function isValidNetwork(value: unknown): value is NetworkName {
  return typeof value === 'string' && value in SOROBAN_NETWORKS;
}

export function getNetworkConfig(network: NetworkName | StellarNetwork) {
  const normalizedNetwork = (network as string).toUpperCase() as NetworkName;
  if (!isValidNetwork(normalizedNetwork)) {
    throw new Error(
      `Invalid network: ${network}. Must be one of: ${Object.keys(SOROBAN_NETWORKS).join(', ')}.`,
    );
  }
  return SOROBAN_NETWORKS[normalizedNetwork];
}

export function getHorizonUrl(network: StellarNetwork): string {
  switch (network) {
    case 'local':
      return 'http://localhost:8000';
    case 'testnet':
      return 'https://horizon-testnet.stellar.org';
    case 'mainnet':
      return 'https://horizon.stellar.org';
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}
