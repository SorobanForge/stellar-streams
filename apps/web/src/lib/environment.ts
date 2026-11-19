import {
  parseEnvironment,
  type EnvironmentConfig,
  type ValidationError,
} from '@stellar-starter-kit/config';

/**
 * The dashboard's `NEXT_PUBLIC_*` variables, read statically.
 *
 * Next.js inlines only *literal* `process.env.NEXT_PUBLIC_NAME` reads into the
 * client bundle. A dynamic lookup such as `process.env[name]` — which
 * `parseEnvironment` performs internally — is not replaced, so in the browser
 * it would read an empty object and every value would silently fall back to the
 * Testnet defaults. Reading each variable here and handing the resulting object
 * to the parser keeps validation identical on the server render and during
 * client hydration.
 */
export const WEB_ENVIRONMENT_VARIABLES = {
  NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_HORIZON_URL: process.env.NEXT_PUBLIC_HORIZON_URL,
  NEXT_PUBLIC_SOROBAN_RPC_URL: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL,
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  NEXT_PUBLIC_STELLAR_EXPERT_URL: process.env.NEXT_PUBLIC_STELLAR_EXPERT_URL,
  NEXT_PUBLIC_STREAM_CONTRACT_ID: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID,
  NEXT_PUBLIC_SPLITS_CONTRACT_ID: process.env.NEXT_PUBLIC_SPLITS_CONTRACT_ID,
  NEXT_PUBLIC_ESCROW_CONTRACT_ID: process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID,
  NEXT_PUBLIC_TOKEN_CONTRACT_ID: process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID,
};

const result = parseEnvironment(WEB_ENVIRONMENT_VARIABLES);

/** Blocking configuration problems; empty when the environment is usable. */
export const environmentErrors: ValidationError[] = result.errors.filter(
  (error) => error.severity === 'error',
);

/**
 * The validated configuration, or `null` when it failed validation. Pages must
 * render `ConfigurationError` in the `null` case instead of falling back to the
 * built-in Testnet defaults: a misconfigured deployment has to be visible.
 */
export const environmentConfig: EnvironmentConfig | null = result.success
  ? (result.config ?? null)
  : null;
