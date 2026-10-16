# @stellar-starter-kit/config

Typed environment configuration and validation for Stellar Streams.

## Overview

This package provides a centralized, type-safe way to parse and validate environment variables for the Stellar Streams dashboard. It ensures:

- **Single source of truth**: All configuration is read through one module
- **Comprehensive validation**: Validates all environment variables at startup
- **Contradiction detection**: Catches mismatches between network selections (e.g., Testnet passphrase with Mainnet RPC)
- **Batch error reporting**: Reports all problems at once instead of failing on first error
- **Type safety**: Exported configuration is fully typed TypeScript

## Usage

### Basic Usage

```typescript
import { parseEnvironment } from '@stellar-starter-kit/config';

// Parse and validate environment variables
const result = parseEnvironment();

if (!result.success) {
  console.error('Environment validation failed:');
  result.errors.forEach((error) => {
    console.error(`  ${error.field}: ${error.message}`);
  });
  process.exit(1);
}

// Use the validated config
const { config } = result;
console.log(config.network); // 'testnet' | 'mainnet' | 'local'
console.log(config.sorobanRpcUrl); // https://soroban-testnet.stellar.org
console.log(config.streamContractId); // Contract ID or undefined
```

### In a Next.js App

```typescript
import { parseEnvironment } from '@stellar-starter-kit/config';

// At module level to fail fast at startup
const envResult = parseEnvironment();
if (!envResult.success) {
  throw new Error(
    `Environment validation failed with ${envResult.errors.length} error(s). Check the console for details.`
  );
}

const { config } = envResult;

// Use throughout the app
const RPC_URL = config.sorobanRpcUrl;
const NETWORK_PASSPHRASE = config.networkPassphrase;
const STREAM_CONTRACT_ID = config.streamContractId ?? '';
```

## Environment Variables

All variables are prefixed with `NEXT_PUBLIC_` for client-side accessibility in Next.js.

### Required or Defaulted

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | Network: `local`, `testnet`, or `mainnet` |
| `NEXT_PUBLIC_TOKEN_CONTRACT_ID` | XLM on testnet | Token contract address to stream |

### Optional (with sensible defaults per network)

These are optional and default to the URL for the selected network:

| Variable | Testnet Default | Description |
|----------|-----------------|-------------|
| `NEXT_PUBLIC_HORIZON_URL` | https://horizon-testnet.stellar.org | Horizon API endpoint |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | https://soroban-testnet.stellar.org | Soroban RPC endpoint |
| `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | Test SDF Network ; September 2015 | Network identifier for signing |
| `NEXT_PUBLIC_STELLAR_EXPERT_URL` | https://stellar.expert/explorer/testnet | Block explorer base URL |

### Optional Contract IDs

Leave blank until deployment:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_STREAM_CONTRACT_ID` | Stream contract address (optional) |
| `NEXT_PUBLIC_SPLITS_CONTRACT_ID` | Splits contract address (optional) |
| `NEXT_PUBLIC_ESCROW_CONTRACT_ID` | Escrow contract address (optional) |

## Contradiction Detection

The parser validates consistency between the network choice and provided URLs/passphrases.

**Invalid example:**
```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

Error:
```
Network passphrase mismatch: "Test SDF Network ; September 2015" is for testnet, but NEXT_PUBLIC_STELLAR_NETWORK is "mainnet". These must match.
```

**Invalid example:**
```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

Error:
```
RPC URL mismatch: "https://soroban-testnet.stellar.org" is for testnet, but NEXT_PUBLIC_STELLAR_NETWORK is "mainnet". These must match.
```

## Type Definitions

### `EnvironmentConfig`

```typescript
interface EnvironmentConfig {
  network: 'local' | 'testnet' | 'mainnet';
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  expertUrl: string;
  streamContractId: string | undefined;
  splitsContractId: string | undefined;
  escrowContractId: string | undefined;
  tokenContractId: string;
}
```

### `ParseResult`

```typescript
interface ParseResult {
  success: boolean;
  config?: EnvironmentConfig;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}
```

## Network Utilities

Helper functions to work with known networks:

```typescript
import {
  KNOWN_NETWORKS,
  getNetworkByPassphrase,
  getNetworkByRpcUrl,
  getNetworkByHorizonUrl,
  isPassphraseForNetwork,
  isRpcUrlForNetwork,
  isHorizonUrlForNetwork,
} from '@stellar-starter-kit/config';

// Get network from a known value
const network = getNetworkByPassphrase('Test SDF Network ; September 2015'); // 'testnet'

// Check if a value is for a specific network
const isTestnet = isPassphraseForNetwork('Test SDF Network ; September 2015', 'testnet'); // true
```

## Testing

Run tests with:

```bash
pnpm test:config
# or
cd packages/config && pnpm test:run
```

Test coverage includes:

- Valid complete environments
- Minimal environments with defaults
- Missing or invalid required values
- Network contradictions (e.g., Testnet passphrase + Mainnet RPC)
- Invalid contract IDs
- Whitespace handling
