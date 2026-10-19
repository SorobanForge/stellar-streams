# @stellar-streams/sdk

TypeScript client SDK for the [Stellar Streams](https://github.com/SorobanForge/stellar-streams) protocol — continuous payment streaming, linear vesting with cliffs, and proportional payment splits on Stellar & Soroban.

[![npm version](https://img.shields.io/badge/npm-@stellar--streams/sdk-blue.svg)](https://www.npmjs.com/package/@stellar-streams/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Migration from `@stellar-starter-kit/sdk`

If you are upgrading from `@stellar-starter-kit/*`, refer to the **[Migration Guide](../../docs/migration.md)** for a complete package mapping table, copy-pasteable codemod scripts, and detailed notes on behaviour changes.

---

## Installation

```bash
# Using pnpm
pnpm add @stellar-streams/sdk @stellar-streams/types @stellar-streams/utils

# Using npm
npm install @stellar-streams/sdk @stellar-streams/types @stellar-streams/utils
```

---

## Quick Start

### Initialize `StreamsClient`

```typescript
import { StreamsClient, assetContractId } from '@stellar-streams/sdk';

const client = new StreamsClient({
  contractId: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID!,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  publicKey: walletAddress,
  signTransaction: async (xdr, { networkPassphrase, address }) => {
    return await wallet.signTransaction(xdr, { networkPassphrase, address });
  },
});
```

### Create a Payment Stream

```typescript
const now = Math.floor(Date.now() / 1000);

// Open a 30-day stream with a 7-day cliff
const { hash } = await client.createStream({
  sender: walletAddress,
  recipient: recipientAddress,
  token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', // SAC or custom token
  amount: '1000000000', // Smallest unit according to token decimals
  startTime: now,
  endTime: now + 30 * 86_400,
  cliffTime: now + 7 * 86_400,
  label: 'Q4 Contributor Grant',
  reference: 'INV-2026-001',
});

console.log('Stream created in tx:', hash);
```

### Inspect and Withdraw

```typescript
// Fetch stream state
const stream = await client.getStream(streamId);

// Query currently claimable balance (in smallest unit)
const claimableAmount = await client.claimable(streamId);

// Withdraw claimable tokens to recipient
if (claimableAmount > 0n) {
  const { hash } = await client.withdraw(streamId);
  console.log('Withdrawal confirmed:', hash);
}
```

### Working with Classic Assets

To stream classic Stellar assets (such as issued USDC or native XLM), derive the Stellar Asset Contract (SAC) id using `assetContractId`:

```typescript
import { assetContractId } from '@stellar-streams/sdk';

// Native XLM
const xlmTokenId = assetContractId('native', networkPassphrase);

// Issued asset (CODE:ISSUER)
const usdcTokenId = assetContractId(`USDC:${USDC_ISSUER}`, networkPassphrase);
```

### Decimals-Aware Metadata

```typescript
const { decimals, symbol } = await client.getTokenMetadata(tokenContractId);
console.log(`Token ${symbol} uses ${decimals} decimal places`);
```

---

## Error Handling

Transactions that would fail on-chain are pre-simulated and reject early with `StreamsError`:

```typescript
import { StreamsError } from '@stellar-streams/sdk';

try {
  await client.withdraw(streamId);
} catch (err) {
  if (err instanceof StreamsError) {
    console.error('Contract error code:', err.code); // e.g. 'NOTHING_TO_WITHDRAW'
    console.error('Contract numeric code:', err.contractCode); // e.g. 5
  }
}
```

---

## Documentation

- [Migration Guide](../../docs/migration.md)
- [Contract Reference](../../docs/contracts.md)
- [Deployments](../../docs/deployments.md)
- [Development Guide](../../docs/development-guide.md)
