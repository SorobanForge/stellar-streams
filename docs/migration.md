# Migration Guide: Moving from `@stellar-starter-kit` to `@stellar-streams`

This guide explains how to migrate projects and integrations built on `@stellar-starter-kit/*` packages to the official `@stellar-streams/*` protocol suite.

---

## 1. Package Renaming Table

The `@stellar-starter-kit/*` scope was established when the project originated as a general-purpose starter template. As the protocol evolved into **Stellar Streams** (a dedicated payments streaming, vesting, and splits system on Stellar & Soroban), all packages were rebranded under `@stellar-streams/*`.

| Old Package Name (`@stellar-starter-kit/*`) | New Package Name (`@stellar-streams/*`) | Purpose & Key Contents                                                                                   |
| :------------------------------------------ | :-------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `@stellar-starter-kit/sdk`                  | `@stellar-streams/sdk`                  | `StreamsClient`, RPC simulation, wallet transaction submission, `StreamsError`, `TokenMetadata`          |
| `@stellar-starter-kit/types`                | `@stellar-streams/types`                | Domain interfaces: `Stream`, `StreamConfig`, `CreateStreamParams`, `Split`, `getStreamStatus`            |
| `@stellar-starter-kit/utils`                | `@stellar-streams/utils`                | Vesting math (`computeVestedAmount`, `vestingCurve`), token & stroop precision helpers                   |
| `@stellar-starter-kit/contracts`            | `@stellar-streams/contracts`            | Generated Soroban TS client bindings: `StreamClient`, `SplitsClient`, `EscrowClient`, `SOROBAN_NETWORKS` |
| `@stellar-starter-kit/hooks`                | `@stellar-streams/hooks`                | React hooks: `useStream`, `useStellarNetworkStatus`                                                      |
| `@stellar-starter-kit/wallets`              | `@stellar-streams/wallets`              | Wallet connectors & context provider (`Freighter`, `Albedo`, `Rabet`, `Hana`)                            |
| `@stellar-starter-kit/ui`                   | `@stellar-streams/ui`                   | Shared design tokens, primitives, `cn` utility                                                           |
| `@stellar-starter-kit/tsconfig`             | `@stellar-streams/tsconfig`             | Shared TypeScript compiler configurations                                                                |
| `@stellar-starter-kit/eslint-config`        | `@stellar-streams/eslint-config`        | Shared ESLint rulesets                                                                                   |
| `@stellar-starter-kit/web`                  | `@stellar-streams/web`                  | Next.js dashboard application                                                                            |

---

## 2. Import Mappings

All exports maintain equivalent or enhanced symbol names. Update your TypeScript and JavaScript imports as follows:

### SDK (`@stellar-streams/sdk`)

```typescript
// Old
import {
  StreamsClient,
  StreamsClientOptions,
  TokenMetadata,
  assetContractId,
  StreamsError,
  StreamErrorCode,
  SplitErrorCode,
} from '@stellar-starter-kit/sdk';

// New
import {
  StreamsClient,
  StreamsClientOptions,
  TokenMetadata,
  assetContractId,
  StreamsError,
  StreamErrorCode,
  SplitErrorCode,
} from '@stellar-streams/sdk';
```

### Domain Types (`@stellar-streams/types`)

```typescript
// Old
import type {
  Stream,
  StreamConfig,
  CreateStreamParams,
  StreamStatus,
  Split,
  SplitConfig,
  WalletState,
  StellarConfig,
  StellarNetwork,
} from '@stellar-starter-kit/types';
import { getStreamStatus } from '@stellar-starter-kit/types';

// New
import type {
  Stream,
  StreamConfig,
  CreateStreamParams,
  StreamStatus,
  Split,
  SplitConfig,
  WalletState,
  StellarConfig,
  StellarNetwork,
} from '@stellar-streams/types';
import { getStreamStatus } from '@stellar-streams/types';
```

### Formatting & Vesting Math Utilities (`@stellar-streams/utils`)

```typescript
// Old
import {
  formatTokenAmount,
  parseTokenAmount,
  formatStroopsToXlm,
  parseXlmToStroops,
  formatAddress,
  formatDuration,
  computeVestedAmount,
  computeProgressBps,
  formatBps,
  VestingSchedule,
} from '@stellar-starter-kit/utils';

// New (includes vestingCurve chart helper)
import {
  formatTokenAmount,
  parseTokenAmount,
  formatStroopsToXlm,
  parseXlmToStroops,
  formatAddress,
  formatDuration,
  computeVestedAmount,
  computeProgressBps,
  formatBps,
  vestingCurve,
  VestingPoint,
  VestingStreamInput,
  VestingSchedule,
} from '@stellar-streams/utils';
```

### Contracts & Client Bindings (`@stellar-streams/contracts`)

```typescript
// Old
import {
  StreamClient,
  SplitsClient,
  EscrowClient,
  SOROBAN_NETWORKS,
} from '@stellar-starter-kit/contracts';

// New
import {
  StreamClient,
  SplitsClient,
  EscrowClient,
  SOROBAN_NETWORKS,
} from '@stellar-streams/contracts';
```

### React Hooks (`@stellar-streams/hooks`)

```typescript
// Old
import { useStream, useStellarNetworkStatus, UseStreamResult } from '@stellar-starter-kit/hooks';

// New
import { useStream, useStellarNetworkStatus, UseStreamResult } from '@stellar-streams/hooks';
```

### Wallets (`@stellar-streams/wallets`)

```typescript
// Old
import {
  WalletProvider,
  useWallet,
  WALLET_PROVIDERS,
  WalletProviderType,
} from '@stellar-starter-kit/wallets';

// New
import {
  WalletProvider,
  useWallet,
  WALLET_PROVIDERS,
  WalletProviderType,
} from '@stellar-streams/wallets';
```

### UI Primitives (`@stellar-streams/ui`)

```typescript
// Old
import { cn, UI_LIBRARY_VERSION } from '@stellar-starter-kit/ui';

// New
import { cn, UI_LIBRARY_VERSION } from '@stellar-streams/ui';
```

### Configuration Packages

In `tsconfig.json`:

```json
{
  "extends": "@stellar-streams/tsconfig/base.json"
}
```

In `eslint.config.js`:

```javascript
const sharedConfig = require('@stellar-streams/eslint-config');
module.exports = [...sharedConfig];
```

---

## 3. Copy-Pasteable Codemod Snippets

### Option A: Shell One-Liner (Linux / macOS)

Run this command from your project root to replace all occurrences across TypeScript, JavaScript, and JSON files:

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  -exec sed -i 's/@stellar-starter-kit\//@stellar-streams\//g' {} +
```

_For macOS (BSD `sed`), use:_

```bash
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.mjs" -o -name "*.json" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" \
  -exec sed -i '' 's/@stellar-starter-kit\//@stellar-streams\//g' {} +
```

### Option B: Node.js Automated Codemod Script

You can run this cross-platform Node.js script without extra dependencies:

```javascript
// run with: node codemod.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_EXTS = ['.ts', '.tsx', '.js', '.mjs', '.json', '.md'];
const OLD_SCOPE = '@stellar-starter-kit/';
const NEW_SCOPE = '@stellar-streams/';

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (TARGET_EXTS.some((ext) => fullPath.endsWith(ext))) {
      const content = readFileSync(fullPath, 'utf8');
      if (content.includes(OLD_SCOPE)) {
        const updated = content.replaceAll(OLD_SCOPE, NEW_SCOPE);
        writeFileSync(fullPath, updated, 'utf8');
        console.log(`Updated imports in: ${fullPath}`);
      }
    }
  }
}

walk('.');
console.log('Migration codemod completed!');
```

---

## 4. Behavioural Changes Beyond the Rename

In addition to package renaming, notable architectural and API enhancements have been introduced that integrators should be aware of:

### 1. Shift from Starter-Kit Template to Protocol Core

- **Old behaviour**: The starter kit included a simple `counter` demo contract, basic Horizon API queries, and generic templates.
- **New behaviour**: Stellar Streams is an production-focused protocol. The `counter` contract is removed. The protocol contracts are:
  - `stream`: Linear token vesting with optional cliff, protocol fee, cancel with unvested refund, and TTL management.
  - `splits`: Multi-recipient proportional share distribution with remainder dust mitigation.
  - `escrow`: Arbiter-mediated multi-party lockup and deadline refunds.

### 2. BigInt Precision Arithmetic

- **Old behaviour**: Early utilities used JavaScript standard `number` types, which caused IEEE-754 precision issues for large 7-decimal or 18-decimal token amounts.
- **New behaviour**: All monetary values and mathematical helpers (`formatTokenAmount`, `parseTokenAmount`, `formatStroopsToXlm`, `parseXlmToStroops`, `computeVestedAmount`, `vestingCurve`) exclusively operate with `bigint`.

### 3. Dynamic Decimals & Multi-Token Support

- **Old behaviour**: Fixed 7-decimal stroop assumptions across all operations.
- **New behaviour**: The protocol supports arbitrary SEP-41 token contracts (`C...`), including native XLM, issued asset SACs, and custom Soroban tokens.
  - Query decimals via `client.getTokenMetadata(tokenAddress)` (cached).
  - Use `formatTokenAmount(amount, decimals)` and `parseTokenAmount(amount, decimals)`.
  - For classic Stellar assets, derive their SAC address using `assetContractId("USDC:GA...", networkPassphrase)`.

### 4. Client Pre-flight Simulation & Error Handling

- **Old behaviour**: Transactions were signed by the wallet and failed only upon ledger submission.
- **New behaviour**: `StreamsClient` simulates transactions against Soroban RPC before requesting wallet signatures. Invalid operations (such as non-positive amounts, invalid cliff ranges, or unauthorized withdrawals) fail immediately with typed `StreamsError` and stable `StreamErrorCode` values, sparing users from signing failing transactions.

### 5. Vesting Chart Curve Generation

- **Old behaviour**: Only point-in-time vested amounts were computed (`computeVestedAmount`).
- **New behaviour**: Added `vestingCurve(stream, samples)` in `@stellar-streams/utils`, generating sample points `{ t, vested }[]` spanning the stream duration, guaranteeing exact inclusion of `start`, `cliff`, and `end` timestamps with strict monotonic non-decreasing guarantees.

---

## 5. Updating Dependencies

To update your project's `package.json`:

```bash
# Using pnpm
pnpm remove @stellar-starter-kit/sdk @stellar-starter-kit/utils @stellar-starter-kit/types
pnpm add @stellar-streams/sdk @stellar-streams/utils @stellar-streams/types

# Using npm
npm uninstall @stellar-starter-kit/sdk @stellar-starter-kit/utils @stellar-starter-kit/types
npm install @stellar-streams/sdk @stellar-streams/utils @stellar-streams/types
```
