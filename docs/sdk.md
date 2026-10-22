# SDK guide

This guide uses live patterns from the repo's working SDK and dashboard code, specifically the `StreamsClient` implementation in `packages/sdk/src/index.ts` and the stream dashboard in `apps/web/src/app/streams/page.tsx`.

## Constructing `StreamsClient`

### Browser / wallet-backed client

```ts
import { StreamsClient } from '@stellar-starter-kit/sdk';

const client = new StreamsClient({
  contractId: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID!,
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  publicKey: walletAddress,
  signTransaction: async (xdr, { networkPassphrase, address }) => {
    return wallet.signTransaction(xdr, { networkPassphrase, address });
  },
});
```

This matches the dashboard setup in `apps/web/src/app/streams/page.tsx` where the wallet connection is injected through `useWallet()` and `signTransaction` is passed to the client.

### SSR-safe client

```ts
import { StreamsClient } from '@stellar-starter-kit/sdk';

const client = new StreamsClient({
  contractId: process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID ?? '',
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  // Leave publicKey/signTransaction unset until a wallet is connected.
});
```

The client intentionally supports being constructed before a wallet is connected. Read-only calls can be used during SSR or prior to hydration; the constructor does not require a signing wallet until a write method is invoked.

## Read a stream

```ts
const streamId = '12';
const stream = await client.getStream(streamId);

if (!stream) {
  console.log('No stream found for id', streamId);
  return;
}

console.log(stream.recipient);
console.log(stream.totalAmount);
console.log(stream.startTime, stream.endTime, stream.cliffTime);
```

The same pattern is used by the dashboard when the user loads a stream by id and then reads its claimable amount and config.

## Read config

```ts
const config = await client.getConfig();

if (!config) {
  console.log('Contract is not initialized yet.');
  return;
}

console.log(config.admin);
console.log(config.treasury);
console.log(config.feeBps);
```

## Get token metadata

```ts
import { assetContractId } from '@stellar-starter-kit/sdk';
import { parseTokenAmount } from '@stellar-starter-kit/utils';

const tokenId = assetContractId('native', 'Test SDF Network ; September 2015');
const { decimals, symbol } = await client.getTokenMetadata(tokenId);

const amountRaw = parseTokenAmount('120.5', decimals).toString();
console.log(amountRaw, symbol);
```

## Create a stream

```ts
const now = Math.floor(Date.now() / 1000);

const { hash } = await client.createStream({
  sender: walletAddress,
  recipient: recipientAddress,
  token: tokenContractId,
  amount: '1000000000',
  startTime: now,
  endTime: now + 30 * 86_400,
  cliffTime: now + 7 * 86_400,
  label: 'Q4 Contributor Grant',
  reference: 'INV-2026-0042',
});

console.log('Stream created:', hash);
```

This is copied from the repo's actual create-stream flow in `apps/web/src/app/streams/page.tsx`.

## Read claimable and withdrawn balances

```ts
const streamId = '12';

const claimableAmount = await client.claimable(streamId);
const vestedAmount = await client.vested(streamId);
const stream = await client.getStream(streamId);

console.log('Claimable:', claimableAmount.toString());
console.log('Vested:', vestedAmount.toString());
console.log('Total:', stream?.totalAmount.toString());
```

## Withdraw, cancel, and write methods

### Withdraw

```ts
const { hash } = await client.withdraw(streamId);
console.log('Withdraw tx:', hash);
```

### Cancel

```ts
const { hash } = await client.cancel(streamId);
console.log('Cancel tx:', hash);
```

### Create stream from a signed wallet

```ts
const { hash } = await client.createStream({
  sender: walletAddress,
  recipient: recipientAddress,
  token: tokenContractId,
  amount: '500000000',
  startTime: now,
  endTime: now + 14 * 86_400,
  cliffTime: now,
});
```

## Error handling with typed SDK errors

```ts
import { StreamsError } from '@stellar-starter-kit/sdk';

try {
  await client.withdraw(streamId);
} catch (error) {
  if (error instanceof StreamsError) {
    console.error('Stable error code:', error.code);
    console.error('Raw contract code:', error.contractCode);
    console.error('Message:', error.message);
    return;
  }

  console.error('Unexpected failure:', error);
}
```

`StreamsError` is created by `StreamsClient` when the contract returns a known `StreamError` code. The stable identifiers are the `code` values, such as `INVALID_AMOUNT`, `STREAM_NOT_FOUND`, or `NOTHING_TO_WITHDRAW`, while `contractCode` preserves the raw numeric enum value.

## Required environment variables

```bash
NEXT_PUBLIC_STREAM_CONTRACT_ID=
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015'
```

The web app also supports a default token override:

```bash
NEXT_PUBLIC_TOKEN_CONTRACT_ID=
```

## Source notes

- This guide is based on the actual SDK in `packages/sdk/src/index.ts`.
- The create-stream and wallet usage pattern comes from `apps/web/src/app/streams/page.tsx`.
- The validation rules on client-side input are reflected in the repo tests under `packages/sdk/src/create-stream.test.ts`.
