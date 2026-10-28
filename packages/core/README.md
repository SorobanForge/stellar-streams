# @stellar-starter-kit/core

Shared network configuration and environment resolution for the Stellar Streams protocol.

## Overview

The `@stellar-starter-kit/core` package provides centralized network configuration management for all Stellar Streams applications and libraries. It consolidates network definitions, environment variable resolution, and configuration validation into a single, reusable module.

## Features

- **Network Registry**: Pre-configured settings for `local`, `testnet`, and `mainnet` networks with RPC URLs, Horizon URLs, and passphrases
- **Environment Resolution**: Resolves configuration from `NEXT_PUBLIC_*` environment variables with sensible defaults
- **Validation**: Ensures network/passphrase consistency to prevent configuration mismatches
- **Type Safety**: Full TypeScript support with exported types for all configurations
- **Zero Dependencies**: Minimal footprint with only `@stellar-starter-kit/types` as a peer dependency

## Installation

```bash
npm install @stellar-starter-kit/core
```

## Usage

### Basic Configuration Resolution

Resolve the current network configuration from environment variables:

```typescript
import { resolveConfig } from '@stellar-starter-kit/core';

const config = resolveConfig();
console.log(config.network);      // 'testnet', 'mainnet', or 'local'
console.log(config.rpcUrl);       // Soroban RPC endpoint
console.log(config.horizonUrl);   // Horizon API endpoint
console.log(config.passphrase);   // Network passphrase
```

### Using Network Registry

Access pre-configured network settings directly:

```typescript
import { NETWORKS, getNetworkConfig } from '@stellar-starter-kit/core';

// All networks at once
const allNetworks = NETWORKS;

// Get a specific network's config
const testnetConfig = getNetworkConfig('testnet');
const mainnetConfig = getNetworkConfig('mainnet');
const localConfig = getNetworkConfig('local');
```

### Getting Default Config for a Network

Retrieve default configuration without reading environment:

```typescript
import { getDefaultConfig } from '@stellar-starter-kit/core';

const testnetDefaults = getDefaultConfig('testnet');
const mainnetDefaults = getDefaultConfig('mainnet');
```

## Environment Variables

Configure the network via these environment variables (all optional with defaults):

- **`NEXT_PUBLIC_STELLAR_NETWORK`** (default: `testnet`)
  - Network to use: `local`, `testnet`, or `mainnet`

- **`NEXT_PUBLIC_SOROBAN_RPC_URL`** (optional)
  - Override the RPC endpoint for the selected network

- **`NEXT_PUBLIC_HORIZON_URL`** (optional)
  - Override the Horizon endpoint for the selected network

- **`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE`** (optional)
  - Must match the selected network's passphrase if provided

## Network Defaults

### Testnet

```typescript
{
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015'
}
```

### Mainnet

```typescript
{
  rpcUrl: 'https://soroban-rpc.stellar.org',
  horizonUrl: 'https://horizon.stellar.org',
  passphrase: 'Public Global Stellar Network ; September 2015'
}
```

### Local

```typescript
{
  rpcUrl: 'http://localhost:8000',
  horizonUrl: 'http://localhost:8000',
  passphrase: 'Standalone Network ; February 2021'
}
```

## Error Handling

Configuration errors are thrown as `ConfigResolutionError`:

```typescript
import { resolveConfig, ConfigResolutionError } from '@stellar-starter-kit/core';

try {
  const config = resolveConfig();
} catch (error) {
  if (error instanceof ConfigResolutionError) {
    console.error('Configuration error:', error.message);
  }
}
```

### Common Errors

**Invalid Network**:
```
Config Resolution Error: Invalid network: "staging". Must be one of: local, testnet, mainnet.
```

**Passphrase Mismatch**:
```
Config Resolution Error: Network passphrase mismatch: provided "..." but network "testnet" expects "Test SDF Network ; September 2015".
```

## Testing

Run the test suite with:

```bash
npm run test
npm run test:run  # Single run (CI mode)
```

Tests cover:
- Default network selection and configuration
- Environment variable overrides
- Passphrase validation and mismatch detection
- Error handling and messages
- Complex scenarios with multiple overrides

## API Reference

### `resolveConfig(env?: Record<string, string>): StellarConfig`

Resolves network configuration from environment variables.

**Parameters:**
- `env` (optional): Environment variables object. Defaults to `process.env`.

**Returns:** `StellarConfig` object with network, rpcUrl, horizonUrl, and passphrase.

**Throws:** `ConfigResolutionError` if validation fails.

### `getDefaultConfig(network: StellarNetwork): StellarConfig`

Gets the default configuration for a specific network.

**Parameters:**
- `network`: One of `'local'`, `'testnet'`, or `'mainnet'`

**Returns:** `StellarConfig` with default values.

**Throws:** Error if network is unknown.

### `getNetworkConfig(network: StellarNetwork): NetworkConfig`

Gets the network configuration (RPC URL, Horizon URL, passphrase) for a specific network.

**Parameters:**
- `network`: One of `'local'`, `'testnet'`, or `'mainnet'`

**Returns:** `NetworkConfig` object.

**Throws:** Error if network is unknown.

### `NETWORKS`

Object containing all network configurations keyed by network name.

## Integration Examples

### With StreamsClient

```typescript
import { StreamsClient } from '@stellar-starter-kit/sdk';
import { resolveConfig } from '@stellar-starter-kit/core';

const config = resolveConfig();

const client = new StreamsClient({
  contractId: 'C...',
  rpcUrl: config.rpcUrl,
  networkPassphrase: config.passphrase,
  publicKey: address,
  signTransaction,
});
```

### With Soroban RPC

```typescript
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { resolveConfig } from '@stellar-starter-kit/core';

const config = resolveConfig();
const server = new SorobanRpc.Server(config.rpcUrl);
```

## Types

All exported types are re-exported from `@stellar-starter-kit/types`:

```typescript
import type { StellarNetwork, StellarConfig } from '@stellar-starter-kit/core';

type StellarNetwork = 'local' | 'testnet' | 'mainnet';

interface StellarConfig {
  network: StellarNetwork;
  horizonUrl: string;
  rpcUrl: string;
  passphrase: string;
}
```

## Contributing

See the main repository's contribution guide.

## License

Apache License 2.0
