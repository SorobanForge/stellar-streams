import { EnvironmentConfig, ParseResult, ValidationError, Network } from './types.js';
import {
  KNOWN_NETWORKS,
  getNetworkByPassphrase,
  getNetworkByRpcUrl,
  getNetworkByHorizonUrl,
} from './networks.js';

/**
 * Environment variable names that the parser expects
 */
const ENV_VARS = {
  NETWORK: 'NEXT_PUBLIC_STELLAR_NETWORK',
  HORIZON_URL: 'NEXT_PUBLIC_HORIZON_URL',
  SOROBAN_RPC_URL: 'NEXT_PUBLIC_SOROBAN_RPC_URL',
  NETWORK_PASSPHRASE: 'NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE',
  EXPERT_URL: 'NEXT_PUBLIC_STELLAR_EXPERT_URL',
  STREAM_CONTRACT_ID: 'NEXT_PUBLIC_STREAM_CONTRACT_ID',
  SPLITS_CONTRACT_ID: 'NEXT_PUBLIC_SPLITS_CONTRACT_ID',
  ESCROW_CONTRACT_ID: 'NEXT_PUBLIC_ESCROW_CONTRACT_ID',
  TOKEN_CONTRACT_ID: 'NEXT_PUBLIC_TOKEN_CONTRACT_ID',
} as const;

/**
 * Default values for environment variables
 */
const DEFAULTS = {
  NETWORK: 'testnet' as const,
  TOKEN_CONTRACT_ID: 'CDLZFC3SYJYDZT7K67VZ75HPJGWGN6XXU250DEX2ZJ26C6EU5R144Z7X' as const,
};

/**
 * Parse and validate NEXT_PUBLIC_* environment variables
 * Reports all problems at once through the ParseResult errors array
 *
 * @param env Environment variables object (defaults to process.env)
 * @returns ParseResult with success flag, validated config, and any errors
 *
 * @example
 * const result = parseEnvironment(process.env);
 * if (!result.success) {
 *   console.error('Environment validation failed:');
 *   result.errors.forEach(e => console.error(`  ${e.field}: ${e.message}`));
 *   process.exit(1);
 * }
 * const config = result.config; // Fully typed and validated
 */
export function parseEnvironment(env?: Record<string, string | undefined>): ParseResult {
  const errors: ValidationError[] = [];

  // Use provided env or fallback to process.env if available
  const processEnv =
    typeof globalThis !== 'undefined' && 'process' in globalThis
      ? ((globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process
          ?.env ?? {})
      : {};
  const environment = env || processEnv;

  // Extract raw values from environment
  const rawNetwork = environment[ENV_VARS.NETWORK]?.trim() || DEFAULTS.NETWORK;
  const rawHorizonUrl = environment[ENV_VARS.HORIZON_URL]?.trim();
  const rawSorobanRpcUrl = environment[ENV_VARS.SOROBAN_RPC_URL]?.trim();
  const rawNetworkPassphrase = environment[ENV_VARS.NETWORK_PASSPHRASE]?.trim();
  const rawExpertUrl = environment[ENV_VARS.EXPERT_URL]?.trim();
  const rawStreamContractId = environment[ENV_VARS.STREAM_CONTRACT_ID]?.trim();
  const rawSplitsContractId = environment[ENV_VARS.SPLITS_CONTRACT_ID]?.trim();
  const rawEscrowContractId = environment[ENV_VARS.ESCROW_CONTRACT_ID]?.trim();
  const rawTokenContractId =
    environment[ENV_VARS.TOKEN_CONTRACT_ID]?.trim() || DEFAULTS.TOKEN_CONTRACT_ID;

  // Validate network is a known value
  if (!isValidNetwork(rawNetwork)) {
    errors.push({
      field: ENV_VARS.NETWORK,
      message: `Invalid network "${rawNetwork}". Must be one of: local, testnet, mainnet.`,
      severity: 'error',
    });
  }

  const network = rawNetwork as Network;
  const knownNetworkConfig = KNOWN_NETWORKS[network];

  // Determine primary network configuration source and validate consistency
  determineNetworkSource(
    { network, rawHorizonUrl, rawSorobanRpcUrl, rawNetworkPassphrase, rawExpertUrl },
    knownNetworkConfig,
    errors,
  );

  // Resolve final configuration values
  const horizonUrl = rawHorizonUrl || knownNetworkConfig.horizonUrl;
  const sorobanRpcUrl = rawSorobanRpcUrl || knownNetworkConfig.sorobanRpcUrl;
  const networkPassphrase = rawNetworkPassphrase || knownNetworkConfig.networkPassphrase;
  const expertUrl = rawExpertUrl || knownNetworkConfig.expertUrl;

  // Validate contract IDs if provided
  if (rawStreamContractId && !isValidContractId(rawStreamContractId)) {
    errors.push({
      field: ENV_VARS.STREAM_CONTRACT_ID,
      message: `Invalid stream contract ID "${rawStreamContractId}". Must be a valid Stellar contract address.`,
      severity: 'error',
    });
  }

  if (rawSplitsContractId && !isValidContractId(rawSplitsContractId)) {
    errors.push({
      field: ENV_VARS.SPLITS_CONTRACT_ID,
      message: `Invalid splits contract ID "${rawSplitsContractId}". Must be a valid Stellar contract address.`,
      severity: 'error',
    });
  }

  if (rawEscrowContractId && !isValidContractId(rawEscrowContractId)) {
    errors.push({
      field: ENV_VARS.ESCROW_CONTRACT_ID,
      message: `Invalid escrow contract ID "${rawEscrowContractId}". Must be a valid Stellar contract address.`,
      severity: 'error',
    });
  }

  if (!isValidContractId(rawTokenContractId)) {
    errors.push({
      field: ENV_VARS.TOKEN_CONTRACT_ID,
      message: `Invalid token contract ID "${rawTokenContractId}". Must be a valid Stellar contract address.`,
      severity: 'error',
    });
  }

  // If we have errors, return failure immediately
  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  // Build the final configuration
  const config: EnvironmentConfig = {
    network,
    horizonUrl,
    sorobanRpcUrl,
    networkPassphrase,
    expertUrl,
    streamContractId: rawStreamContractId || undefined,
    splitsContractId: rawSplitsContractId || undefined,
    escrowContractId: rawEscrowContractId || undefined,
    tokenContractId: rawTokenContractId,
  };

  return {
    success: true,
    config,
    errors: [],
  };
}

/**
 * Determine which network configuration source to use and validate consistency
 * Checks for contradictions between NEXT_PUBLIC_STELLAR_NETWORK and derived network
 * from passphrase/RPC URL/Horizon URL
 */
function determineNetworkSource(
  {
    network,
    rawHorizonUrl,
    rawSorobanRpcUrl,
    rawNetworkPassphrase,
    rawExpertUrl,
  }: {
    network: Network;
    rawHorizonUrl?: string;
    rawSorobanRpcUrl?: string;
    rawNetworkPassphrase?: string;
    rawExpertUrl?: string;
  },
  knownNetworkConfig: (typeof KNOWN_NETWORKS)[Network],
  errors: ValidationError[],
): 'network' | 'passphrase' | 'rpc' | 'horizon' {
  // Check passphrase first - it's the most authoritative for network validation
  if (rawNetworkPassphrase) {
    const passphraseNetwork = getNetworkByPassphrase(rawNetworkPassphrase);
    if (!passphraseNetwork) {
      errors.push({
        field: ENV_VARS.NETWORK_PASSPHRASE,
        message: `Unknown network passphrase "${rawNetworkPassphrase}". This is not a recognized Stellar network.`,
        severity: 'error',
      });
    } else if (passphraseNetwork !== network) {
      errors.push({
        field: ENV_VARS.NETWORK_PASSPHRASE,
        message: `Network passphrase mismatch: "${rawNetworkPassphrase}" is for ${passphraseNetwork}, but NEXT_PUBLIC_STELLAR_NETWORK is "${network}". These must match.`,
        severity: 'error',
      });
    }
  }

  // Check RPC URL
  if (rawSorobanRpcUrl) {
    const rpcNetwork = getNetworkByRpcUrl(rawSorobanRpcUrl);
    if (!rpcNetwork) {
      errors.push({
        field: ENV_VARS.SOROBAN_RPC_URL,
        message: `RPC URL "${rawSorobanRpcUrl}" does not match any known Stellar network. Use one of: ${Object.values(
          KNOWN_NETWORKS,
        )
          .map((n) => n.sorobanRpcUrl)
          .join(', ')}`,
        severity: 'error',
      });
    } else if (rpcNetwork !== network) {
      errors.push({
        field: ENV_VARS.SOROBAN_RPC_URL,
        message: `RPC URL mismatch: "${rawSorobanRpcUrl}" is for ${rpcNetwork}, but NEXT_PUBLIC_STELLAR_NETWORK is "${network}". These must match.`,
        severity: 'error',
      });
    }
  }

  // Check Horizon URL
  if (rawHorizonUrl) {
    const horizonNetwork = getNetworkByHorizonUrl(rawHorizonUrl);
    if (!horizonNetwork) {
      errors.push({
        field: ENV_VARS.HORIZON_URL,
        message: `Horizon URL "${rawHorizonUrl}" does not match any known Stellar network. Use one of: ${Object.values(
          KNOWN_NETWORKS,
        )
          .map((n) => n.horizonUrl)
          .join(', ')}`,
        severity: 'error',
      });
    } else if (horizonNetwork !== network) {
      errors.push({
        field: ENV_VARS.HORIZON_URL,
        message: `Horizon URL mismatch: "${rawHorizonUrl}" is for ${horizonNetwork}, but NEXT_PUBLIC_STELLAR_NETWORK is "${network}". These must match.`,
        severity: 'error',
      });
    }
  }

  // Check Expert URL (less authoritative, just a warning if it doesn't match)
  if (rawExpertUrl) {
    const expectedExpertUrl = knownNetworkConfig.expertUrl;
    if (rawExpertUrl !== expectedExpertUrl) {
      errors.push({
        field: ENV_VARS.EXPERT_URL,
        message: `Expert URL might be incorrect: "${rawExpertUrl}" doesn't match the expected URL for ${network}: "${expectedExpertUrl}".`,
        severity: 'warning',
      });
    }
  }

  return 'network';
}

/**
 * Check if a string is a valid network identifier
 */
function isValidNetwork(value: string): value is Network {
  return value === 'local' || value === 'testnet' || value === 'mainnet';
}

/**
 * Check if a string is a valid Stellar contract ID
 * Contract IDs are 56-character base32 strings starting with 'C'
 */
function isValidContractId(value: string): boolean {
  if (!value) return false;
  // Stellar contract IDs are 56-char base32 strings starting with 'C'
  const contractIdRegex = /^C[A-Z2-7]{55}$/;
  return contractIdRegex.test(value);
}

export { ENV_VARS, DEFAULTS };
