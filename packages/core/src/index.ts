// Export network configuration
export { NETWORKS, type NetworkConfig, getNetworkConfig } from './networks';

// Export configuration resolution
export { resolveConfig, getDefaultConfig, ConfigResolutionError } from './config';

// Re-export types for convenience
export type { StellarNetwork, StellarConfig } from '@stellar-starter-kit/types';
