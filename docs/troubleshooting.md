# Troubleshooting

Reports from Testnet users repeat the same handful of causes. This page lists each known
symptom, the exact error text you will see, the cause, and the fix. Search for the error text
you received (Ctrl+F / Cmd+F) and jump straight to the matching entry.

To confirm whether a deployment actually exists before debugging anything else, see
[Confirming the deployment state](#confirming-the-deployment-state) below and the contract ids
page in [deployments.md](deployments.md).

## Quick index

| You see                                                                  | Cause                             | Jump to                                                                           |
| :----------------------------------------------------------------------- | :-------------------------------- | :-------------------------------------------------------------------------------- |
| `Freighter wallet extension is not installed or enabled.`                | Wallet extension missing/disabled | [1. Wallet extension not installed](#1-wallet-extension-not-installed-or-enabled) |
| Transactions rejected after you sign, or `Simulation of ... failed: ...` | Wallet on the wrong network       | [2. Wrong network](#2-wrong-network-in-the-wallet-or-app)                         |
| `No stream contract id configured.`                                      | Contract id env var empty         | [3. Empty contract id](#3-empty-contract-id)                                      |
| `Account not found`                                                      | Account has no XLM for fees       | [4. Unfunded account](#4-unfunded-account)                                        |
| `RPC kept answering TRY_AGAIN_LATER for transaction ...`                 | Public RPC rate limit             | [5. Public RPC rate limits](#5-public-rpc-rate-limits)                            |

---

## 1. Wallet extension not installed or enabled

### Error text

```
Freighter wallet extension is not installed or enabled.
```

The same pattern exists for the other supported wallets:

```
Rabet wallet extension is not installed.
Hana wallet extension is not installed.
```

### Cause

The dashboard signs transactions through a browser wallet extension. Clicking **Connect
Freighter** (or Rabet/Hana) on `/streams` or `/escrow` throws this error when the extension is
not installed, is disabled, or the page is open in a private/incognito window where extensions
are blocked.

### Fix

1. Install the wallet from its official source (for Freighter, the
   [Freighter site](https://freighter.app)).
2. Enable the extension in your browser's extension settings.
3. Reload the dashboard tab and connect again.
4. If you are in a private/incognito window, allow the extension in that window or use a normal
   tab.

---

## 2. Wrong network in the wallet or app

### Error text

The mismatch usually surfaces as a simulation failure on any read or write:

```
Simulation of create_stream failed: ...
Simulation of getStream failed: ...
```

or, if a signed transaction is rejected at submission:

```
Transaction <hash> was rejected: ...
```

In the wallet itself you may see a signing prompt for a network that does not match the one the
dashboard is configured for.

### Cause

The dashboard is configured for one network via `NEXT_PUBLIC_STELLAR_NETWORK` and
`NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` (Testnet by default), while the connected wallet is
set to a different network (for example Mainnet). A contract id deployed on Testnet does not
exist on Mainnet, so every simulation fails even though the wallet connects fine.

### Fix

1. Open the wallet's network settings and select the network the dashboard uses. For Testnet,
   Freighter's network must be `TESTNET` (passphrase `Test SDF Network ; September 2015`).
2. Verify the app configuration in `apps/web/.env.local` matches:

   | Variable                                 | Testnet value                         |
   | :--------------------------------------- | :------------------------------------ |
   | `NEXT_PUBLIC_STELLAR_NETWORK`            | `testnet`                             |
   | `NEXT_PUBLIC_SOROBAN_RPC_URL`            | `https://soroban-testnet.stellar.org` |
   | `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015`   |

3. Rebuild the app after changing any `NEXT_PUBLIC_*` variable — they are inlined at build
   time, so a restart alone is not enough (`pnpm dev` again, or a fresh `pnpm build` for a
   hosted deployment).
4. Contract ids are per-network. An id from [deployments.md](deployments.md) is a Testnet id;
   do not paste it into a Mainnet or local configuration.

---

## 3. Empty contract id

### Error text

In the SDK:

```
No stream contract id configured.
```

In the dashboard a banner appears above the create form — **Stream contract not configured** —
and actions report:

```
No stream contract configured. Set NEXT_PUBLIC_STREAM_CONTRACT_ID.
```

The helper scripts report:

```
Error: Stream contract id not found in deployments.
Error: Escrow contract ID not found in deployments.
```

### Cause

`NEXT_PUBLIC_STREAM_CONTRACT_ID` (and the splits/escrow equivalents) are empty. Either no
deployment has been run, the ids were never copied into `apps/web/.env.local`, or the env file
was changed after the last build without rebuilding.

### Fix

1. Deploy the contracts (see the [development guide](development-guide.md)):

   ```bash
   pnpm build:contracts
   pnpm optimize
   pnpm deploy:testnet
   ```

2. The deploy script prints a copy-pasteable block. Put the ids into `apps/web/.env.local`:

   ```
   NEXT_PUBLIC_STREAM_CONTRACT_ID=C...
   NEXT_PUBLIC_SPLITS_CONTRACT_ID=C...
   NEXT_PUBLIC_ESCROW_CONTRACT_ID=C...
   ```

3. Rebuild or restart the dev server so the `NEXT_PUBLIC_*` values are inlined.
4. Confirm the ids are real by opening the contract ids page in
   [deployments.md](deployments.md) and clicking the explorer link for each contract — a
   deployed contract shows code and a deploy transaction on
   `stellar.expert/explorer/testnet`.

---

## 4. Unfunded account

### Error text

Reads and writes fail before anything is signed, with an account lookup error such as:

```
Account not found
```

Funding via the CLI may also fail transiently:

```
Error while funding account ...
```

### Cause

A newly generated keypair has no XLM. Every transaction needs a funded source account to pay
fees and meet the minimum balance, and simulations against Soroban RPC also require the source
account to exist.

### Fix

On Testnet, fund the account with Friendbot:

```bash
stellar keys fund <your-key-name> --network testnet
```

or open `https://friendbot.stellar.org/?addr=<G...ADDRESS>` once, replacing `<G...ADDRESS>`
with your public key.

On the local Quickstart node, friendbot runs locally:

```bash
stellar keys fund <your-key-name> --network local
```

Friendbot occasionally fails with transient network errors — wait a few seconds and retry; the
account appears on Horizon once funding lands.

---

## 5. Public RPC rate limits

### Error text

The SDK retries automatically, but a sustained burst can exhaust the retry budget:

```
RPC kept answering TRY_AGAIN_LATER for transaction <hash> after 30s.
```

The underlying HTTP calls may also fail with rate-limit responses (HTTP 429) from the shared
public endpoint.

### Cause

`https://soroban-testnet.stellar.org` is a shared public RPC endpoint. Heavy use — many rapid
creates/withdraws, polling loops, or several people sharing one IP — hits its rate limit. The
node answers `TRY_AGAIN_LATER` (its mempool is full or the caller is throttled) instead of
accepting the transaction.

### Fix

1. Do nothing: the SDK already resubmits `TRY_AGAIN_LATER` transactions with exponential
   backoff for up to 30 seconds. Transient bursts usually recover on their own — wait and retry
   the action once.
2. Space out submissions; avoid parallel write loops from the same account.
3. Point the dashboard at your own RPC node. Set `NEXT_PUBLIC_SOROBAN_RPC_URL` to a dedicated
   Soroban RPC (self-hosted, or a provider with a higher quota) and rebuild — this removes the
   shared limit entirely.
4. For contract development, use the local Quickstart node instead of Testnet (see the
   [development guide](development-guide.md)); it has no rate limits.

---

## Confirming the deployment state

Before working through the entries above, confirm the contracts are actually deployed on the
network you are using. The contract ids page in [deployments.md](deployments.md) is the
human-readable record; `apps/web/src/generated/deployments.json` is the machine-readable source
of truth written by `pnpm deploy:testnet`.

Check all three of the following:

1. **The ids page is filled in.** On Testnet, [deployments.md](deployments.md) lists one `C...`
   id per contract (`stream`, `splits`, `escrow`). If a row still says _TBD_, no deployment has
   been recorded for that contract and the dashboard cannot reach it.
2. **The explorer link resolves.** Each id links to
   `https://stellar.expert/explorer/testnet/contract/<ID>`. A deployed contract shows its WASM
   hash and a deploy transaction. An id with no contract page means the id is wrong or was
   deployed to a different network.
3. **Your env matches the page.** The `NEXT_PUBLIC_*_CONTRACT_ID` values in
   `apps/web/.env.local` must equal the ids on the page. A mismatch — for example a local
   deployment's id pasted into a Testnet configuration — produces simulation failures that look
   like app bugs but are just the wrong network, as in
   [entry 2](#2-wrong-network-in-the-wallet-or-app).

If the ids page is stale after your own deployment, re-run `pnpm deploy:testnet` and update it
per the instructions at the bottom of [deployments.md](deployments.md).

---

## Build and toolchain errors

These block the deploy flow itself rather than the dashboard, but they come up in the same
Testnet reports.

### `This project uses pnpm, not "npm".`

The repo rejects npm/yarn installs. Enable pnpm and install again:

```bash
corepack enable
pnpm install
```

### `error: target 'wasm32v1-none' not found`

The Rust toolchain is missing the WASM target the contracts build for:

```bash
rustup target add wasm32v1-none --toolchain stable
```

### `stellar: command not found`

The Stellar CLI is not on your `PATH`. Fetch the pinned build the scripts use:

```bash
pnpm download:cli
```

or install the [Stellar CLI](https://github.com/stellar/stellar-cli/releases) yourself and
ensure `stellar` resolves in new shells.

### `Error: WASM file not found for stream.` / `Release directory not found.`

The deploy step ran before the contracts were built. Build and optimize first:

```bash
pnpm build:contracts
pnpm optimize
pnpm deploy:testnet
```

---

## Still stuck?

Open a [GitHub issue](https://github.com/SorobanForge/stellar-streams/issues) with the exact
error text, the network you are on (`NEXT_PUBLIC_STELLAR_NETWORK`), and your `stellar --version`
and `node --version` output. For security reports, use [SECURITY.md](../SECURITY.md) instead.
