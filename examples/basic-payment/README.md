# Basic Payment Example

A minimal, runnable example demonstrating how to create a payment stream on Stellar Testnet using the `@stellar-starter-kit/sdk`.

## What you'll learn

This example shows how to:

- Initialize a `StreamsClient` with a contract id and RPC endpoint
- Create a stream that vests linearly over time
- Sign transactions with a local keypair
- Print the transaction hash and stream id to verify on-chain

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (or npm/yarn)
- A Testnet account with XLM available to pay for transaction fees
- The deployed `stream` contract id from Testnet (see below)

## Setup

### 1. Install dependencies

From the monorepo root:

```bash
pnpm install
```

### 2. Get the stream contract id

The contract id is needed to interact with the stream contract on Testnet. If you haven't deployed yet:

```bash
# From the monorepo root, build and deploy contracts to Testnet
pnpm build:contracts
pnpm optimize
pnpm deploy:stream
```

The contract id will be printed at the end of the deploy step. You can also find it in:

- `apps/web/src/generated/deployments.json` (after deployment)
- [docs/deployments.md](../../docs/deployments.md) (human-readable reference)

### 3. Set environment variables

Copy `.env.example` to `.env` and fill in the required fields:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
# Your Testnet stream contract ID (from step 2)
STREAM_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4

# Your Stellar secret key (starts with S)
# ⚠️  Use a TEST ACCOUNT ONLY. Never commit real keys.
# Generate one: https://laboratory.stellar.org/#account-creator?network=testnet
SENDER_SEED=SBMULCGCUSWCEJCW6QTFVRFZN2JMCZOGKDVL4W5HWXB3S7QQ4IGDPQQ

# Recipient's public key (starts with G)
# Can be the same as sender for testing, or a different test account
RECIPIENT_ADDRESS=GBUDFY2LJLXABIW2XOQMIWRLPXZ4J7VQZPGROYASQIXC6WHSFXGM2OO
```

## Usage

### Run with tsx (fast, no build step)

```bash
pnpm run dev
```

### Build and run

```bash
pnpm run build
pnpm run start
```

## Expected output

When you run the example, you'll see:

```
🚀 Stellar Streams Basic Payment Example

Sender:    GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4
Recipient: GBUDFY2LJLXABIW2XOQMIWRLPXZ4J7VQZPGROYASQIXC6WHSFXGM2OO
Contract:  CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4

📤 Creating stream...
   Amount:   10 XLM
   Duration: 30 days

✅ Stream created successfully!

Transaction Hash: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
Stream ID:        1

📊 Stream Details:
   ID:            1
   Sender:        GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4
   Recipient:     GBUDFY2LJLXABIW2XOQMIWRLPXZ4J7VQZPGROYASQIXC6WHSFXGM2OO
   Total Amount:  10 XLM
   Vesting Days:  30
   Cliff:         None (vests immediately)

📌 Explorer link: https://stellar.expert/explorer/testnet/tx/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

## How it works

### Stream creation

The example creates a stream with the following parameters:

- **Amount:** 10 XLM (locked up front)
- **Duration:** 30 days (vests linearly from start to end)
- **Cliff:** None (vesting starts immediately at the start time)
- **Token:** Stellar native asset (XLM) via the SAC

The vesting formula is:

```
vested(now) = 0              if now < start
            = total          if now >= end
            = total * (now - start) / (end - start)  otherwise
```

So after 15 days, 5 XLM will be vested and claimable by the recipient.

### Transaction signing

This example signs transactions locally using the `SENDER_SEED` keypair. In a browser-based app, you would:

- Use a wallet like Freighter, Albedo, or Rabet
- Call `wallet.signTransaction(xdr)` instead of signing locally
- See `packages/wallets` for wallet integration examples

## Customization

### Change the stream amount

In `src/index.ts`, modify the `amount` variable:

```typescript
const amount = '2000000000'; // 20 XLM in stroops
```

### Change the vesting period

Modify `thirtyDaysFromNow`:

```typescript
const seventyDaysFromNow = now + 70 * 86_400;
const result = await client.createStream({
  // ...
  endTime: seventyDaysFromNow,
  // ...
});
```

### Add a cliff

Set `cliffTime` to a future date:

```typescript
const cliffTime = now + 7 * 86_400; // 7-day cliff
const result = await client.createStream({
  // ...
  cliffTime,
  // ...
});
```

With a 7-day cliff, no tokens are vested before day 7, then they vest linearly after that.

## Troubleshooting

### `STREAM_CONTRACT_ID environment variable is required`

Set `STREAM_CONTRACT_ID` in `.env` (see Setup step 3).

### `Simulation of create_stream failed: ...`

Check that:

- The contract id is correct and deployed on Testnet
- Your account has XLM to pay for the transaction fee (~0.1 XLM)
- The recipient address is valid

### `Transaction submission failed`

The transaction was prepared but failed on-chain. Common causes:

- Insufficient balance in sender account
- Invalid recipient address
- Token contract not found

Check the explorer link to see the detailed error.

## Next steps

- Explore the stream details: call `client.getStream(id)`, `client.claimable(id)`, `client.vested(id)`
- Learn about the `splits` contract for multi-recipient payments
- Integrate with a wallet (see `packages/wallets`)
- Build a UI using React hooks (see `packages/hooks`)
- Read the [Architecture guide](../../ARCHITECTURE.md) for a deeper dive

## References

- [SDK documentation](../../packages/sdk)
- [Types reference](../../packages/types)
- [Utils library](../../packages/utils)
- [Contract ABIs](../../packages/contracts)
- [Stellar Testnet Faucet](https://laboratory.stellar.org/#account-creator?network=testnet)
- [Stellar Expert Explorer](https://stellar.expert/explorer/testnet)
