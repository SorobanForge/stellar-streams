/**
 * Network types supported by Stellar Streams
 */
export type Network = 'local' | 'testnet' | 'mainnet';

/**
 * Configuration for a Stellar network
 */
export interface NetworkConfig {
  network: Network;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  expertUrl: string;
}

/**
 * Parsed and validated environment configuration
 */
export interface EnvironmentConfig {
  network: Network;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  expertUrl: string;
  streamContractId: string | undefined;
  splitsContractId: string | undefined;
  escrowContractId: string | undefined;
  tokenContractId: string;
}

/**
 * Validation error with details about what went wrong
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Result of parsing and validating environment variables
 */
export interface ParseResult {
  success: boolean;
  config?: EnvironmentConfig;
  errors: ValidationError[];
}
