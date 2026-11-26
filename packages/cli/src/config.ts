import { StrKey } from '@stellar/stellar-sdk';
import { KNOWN_NETWORKS, type Network, type NetworkConfig } from '@stellar-starter-kit/config';

/** Networks the CLI accepts for `--network`, matching the shared constants. */
export const NETWORK_NAMES = Object.keys(KNOWN_NETWORKS) as Network[];

/** Environment variable holding the stream contract id. */
export const CONTRACT_ID_ENV = 'STREAMS_CONTRACT_ID';

/** Environment variables that may hold the signing secret, in order of precedence. */
export const SECRET_KEY_ENVS = ['STREAMS_SECRET_KEY', 'STELLAR_SECRET_KEY'] as const;

/**
 * The network a command runs against. Endpoints and the passphrase come from
 * `@stellar-starter-kit/config`, the same registry the SDK and dashboard use.
 */
export function resolveNetwork(name: string): NetworkConfig {
  const config = KNOWN_NETWORKS[name as Network];
  if (!config) {
    throw new Error(`Unknown network "${name}". Expected one of: ${NETWORK_NAMES.join(', ')}.`);
  }
  return config;
}

/** Reads the stream contract id from `--contract-id` or the environment. */
export function resolveContractId(flag: string | undefined): string {
  const contractId = flag ?? process.env[CONTRACT_ID_ENV];
  if (!contractId) {
    throw new Error(`Missing stream contract id. Pass --contract-id or set ${CONTRACT_ID_ENV}.`);
  }
  if (!StrKey.isValidContract(contractId)) {
    throw new Error(`"${contractId}" is not a valid contract id (expected C...).`);
  }
  return contractId;
}

/**
 * Reads the signing secret from `--secret-key` or the environment. Passing the
 * key as a flag is supported for scripting, but the environment variable is the
 * documented path because flags show up in shell history.
 */
export function resolveSecretKey(flag: string | undefined): string {
  const secretKey = flag ?? SECRET_KEY_ENVS.map((name) => process.env[name]).find(Boolean);
  if (!secretKey) {
    throw new Error(`Missing signing key. Set ${SECRET_KEY_ENVS[0]} (or pass --secret-key).`);
  }
  if (!StrKey.isValidEd25519SecretSeed(secretKey)) {
    throw new Error('The signing key is not a valid Stellar secret seed (expected S...).');
  }
  return secretKey;
}
