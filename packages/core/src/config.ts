import type { StellarNetwork, StellarConfig } from '@stellar-starter-kit/types';
import { NETWORKS, getNetworkConfig } from './networks';

/**
 * Configuration resolution error thrown when environment variables are invalid or mismatched.
 */
export class ConfigResolutionError extends Error {
  constructor(message: string) {
    super(`Config Resolution Error: ${message}`);
    this.name = 'ConfigResolutionError';
  }
}

/**
 * Resolves the Stellar network configuration from environment variables.
 *
 * Reads the following environment variables (with defaults):
 * - NEXT_PUBLIC_STELLAR_NETWORK: 'testnet' | 'mainnet' | 'local' (default: 'testnet')
 * - NEXT_PUBLIC_SOROBAN_RPC_URL: Soroban RPC endpoint (optional; uses network default if not provided)
 * - NEXT_PUBLIC_HORIZON_URL: Horizon API endpoint (optional; uses network default if not provided)
 * - NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: Network passphrase (optional; uses network default if not provided)
 *
 * Validates that:
 * 1. The resolved network is a valid StellarNetwork ('local', 'testnet', or 'mainnet')
 * 2. If a passphrase is explicitly provided, it matches the network's expected passphrase
 *
 * @param env - Environment variables object (defaults to process.env for Node.js/browser)
 * @returns Resolved StellarConfig with validated network settings
 * @throws ConfigResolutionError if validation fails
 */
export function resolveConfig(env: Record<string, string | undefined> = process.env): StellarConfig {
  // Read the network from environment or default to testnet
  const networkInput = env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';

  // Validate that the network is recognized
  if (!isValidNetwork(networkInput)) {
    throw new ConfigResolutionError(
      `Invalid network: "${networkInput}". Must be one of: local, testnet, mainnet.`,
    );
  }

  const network = networkInput as StellarNetwork;

  // Get the default configuration for this network
  const networkConfig = getNetworkConfig(network);

  // Allow overrides for each endpoint, but validate passphrases match if provided
  const rpcUrl = env.NEXT_PUBLIC_SOROBAN_RPC_URL || networkConfig.rpcUrl;
  const horizonUrl = env.NEXT_PUBLIC_HORIZON_URL || networkConfig.horizonUrl;
  const passphrase = env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || networkConfig.passphrase;

  // Validate passphrase consistency: if explicitly provided, must match the network's expected passphrase
  if (
    env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE &&
    env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE !== networkConfig.passphrase
  ) {
    throw new ConfigResolutionError(
      `Network passphrase mismatch: provided "${env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE}" ` +
        `but network "${network}" expects "${networkConfig.passphrase}".`,
    );
  }

  return {
    network,
    rpcUrl,
    horizonUrl,
    passphrase,
  };
}

/**
 * Type guard to check if a string is a valid StellarNetwork.
 */
function isValidNetwork(value: string): value is StellarNetwork {
  return value === 'local' || value === 'testnet' || value === 'mainnet';
}

/**
 * Retrieves the default environment configuration for a specific network without reading process.env.
 * Useful for testing and explicit network selection.
 *
 * @param network - The network to get defaults for
 * @returns StellarConfig with default values for the network
 */
export function getDefaultConfig(network: StellarNetwork): StellarConfig {
  const networkConfig = getNetworkConfig(network);
  return {
    network,
    rpcUrl: networkConfig.rpcUrl,
    horizonUrl: networkConfig.horizonUrl,
    passphrase: networkConfig.passphrase,
  };
}
