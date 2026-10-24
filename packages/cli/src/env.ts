import type { StellarNetwork } from '@stellar-starter-kit/types';

export interface CliEnv {
  secretKey: string;
  contractId: string;
  network: StellarNetwork;
}

export function loadEnv(): CliEnv {
  const secretKey = process.env['STELLAR_STREAMS_SECRET_KEY'];
  const contractId = process.env['STELLAR_STREAMS_CONTRACT_ID'];
  const networkStr = process.env['STELLAR_STREAMS_NETWORK'] || 'testnet';

  // Validate required environment variables
  const missingVars = [];
  if (!secretKey) missingVars.push('STELLAR_STREAMS_SECRET_KEY');
  if (!contractId) missingVars.push('STELLAR_STREAMS_CONTRACT_ID');

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}.\n` +
      `Please set these in a .env file or as environment variables.`,
    );
  }

  // Validate network
  const validNetworks: StellarNetwork[] = ['local', 'testnet', 'mainnet'];
  if (!validNetworks.includes(networkStr as StellarNetwork)) {
    throw new Error(
      `Invalid STELLAR_STREAMS_NETWORK value: "${networkStr}". ` +
      `Must be one of: ${validNetworks.join(', ')}.`,
    );
  }

  return {
    secretKey: secretKey as string,
    contractId: contractId as string,
    network: networkStr as StellarNetwork,
  };
}

/**
 * Validates that the secret key is a valid Stellar secret key.
 * Secret keys start with 'S' followed by 56 alphanumeric characters.
 */
export function isValidSecretKey(key: string): boolean {
  return /^S[A-Z2-7]{55}$/.test(key);
}

/**
 * Masks a secret key for safe logging (shows only first and last 4 chars).
 */
export function maskSecretKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
