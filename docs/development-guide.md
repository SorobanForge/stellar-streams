# Local Development Guide

Welcome to the Stellar Streams developer documentation! This guide explains how to configure your local machine for developing and deploying the protocol's Soroban smart contracts.

---

## 1. Running Stellar Quickstart

For local development, it is highly recommended to run a local node rather than testing directly on Testnet or Futurenet. We use the official Stellar Quickstart Docker image.

### Start the Local Node

You can spin up the node in three ways depending on your workflow and OS:

#### Option A: Using pnpm Script (Recommended)

This runs Docker Compose in the background:

```bash
pnpm run node:local
```

#### Option B: Using Setup Scripts

Run the helper setup script for your platform:

- **Windows (PowerShell)**:
  ```powershell
  ./scripts/setup-local-node.ps1
  ```
- **macOS / Linux (Bash)**:
  ```bash
  ./scripts/setup-local-node.sh
  ```

#### Option C: Direct Docker Compose

```bash
docker compose up -d
```

### Horizon and RPC Endpoints

Once running, the following local services are available:

- **Horizon API Gateway**: `http://localhost:8000`
- **Soroban RPC Gateway**: `http://localhost:8000/soroban/rpc`

### Stop the Local Node

To stop the background node and clean up the container resources, run:

```bash
docker compose down
```

---

## 2. Soroban Smart Contract Development & Automation

To compile, test, optimize, and deploy smart contracts, you can use the workspace shortcuts configured in the monorepo root.

### Build Contracts

Compile the Soroban Rust workspace contracts to WebAssembly:

```bash
pnpm build:contracts
```

### Optimize WASM

Optimize compiled contracts to minimize byte size and gas footprint:

```bash
pnpm optimize
```

### Generate TypeScript Bindings (no deploy)

The `packages/contracts` SDK ships committed TypeScript clients for the `stream`, `splits`, and `escrow` contracts. They live in `packages/contracts/src/generated/<contract>` and are re-exported from the package index. Regenerate them from the locally built WASM at any time — this needs the [Stellar CLI](https://github.com/stellar/stellar-cli/releases) (`stellar`) on your `PATH`, but **no network access and no deployment**:

```bash
pnpm generate:bindings
```

This builds the contracts (`cargo build --target wasm32v1-none --release`) and runs `stellar contract bindings typescript` against each `contracts/target/wasm32v1-none/release/<contract>.wasm`. Commit the resulting changes under `packages/contracts/src/generated/`.

### Deploy Contracts

Deploy the optimized contracts to Stellar Testnet and generate strongly-typed TypeScript client bindings automatically inside `packages/contracts/src/generated`:

```bash
pnpm deploy:stream
pnpm deploy:splits
pnpm deploy:escrow
```

After deploying, copy the printed contract ids into `.env.local`
(`NEXT_PUBLIC_STREAM_CONTRACT_ID`, `NEXT_PUBLIC_SPLITS_CONTRACT_ID`) so the dashboard can reach them.

### Invoke Contract via CLI

Demonstrate and verify contract execution on Stellar Testnet:

```bash
pnpm invoke:stream
pnpm invoke:escrow
```

### Verification & Linting

Run standard unit tests, formatting checks, and clippy lints inside the `contracts` workspace:

```bash
# Run unit tests (also available as `pnpm test:contracts`)
cargo test --manifest-path contracts/Cargo.toml

# Check code formatting
cargo fmt --manifest-path contracts/Cargo.toml --all -- --check

# Format code automatically
cargo fmt --manifest-path contracts/Cargo.toml --all

# Run Clippy lints (also available as `pnpm lint:contracts`)
cargo clippy --manifest-path contracts/Cargo.toml --all-targets -- -D warnings

# Build optimized WASM for deployment
cargo build --manifest-path contracts/Cargo.toml --target wasm32v1-none --release
```

---

## 3. End-to-end walkthrough: a stream from zero to withdraw

This walkthrough runs the complete lifecycle against a local node: start Quickstart, build and
deploy the `stream` contract, fund accounts, deploy a token, create a stream, watch it vest,
and withdraw. Every command is copy-pasteable and is followed by its expected output, so you can
compare as you go.

> **Verification status:** run and verified end-to-end on Linux (x86_64, Docker 29.8.0,
> stellar CLI 27.0.0). Untested on macOS and Windows — the commands are the same, but nobody on
> the team has exercised this exact sequence there yet. Amounts and timestamps in the outputs
> will differ slightly on your machine; the shapes should match.

### Prerequisites

- Docker with the compose plugin
- Rust toolchain with the `wasm32v1-none` target (`rustup target add wasm32v1-none --toolchain stable`)
- The [Stellar CLI](https://github.com/stellar/stellar-cli/releases) on your `PATH`
  (`stellar --version` should print, e.g. `stellar 27.0.0`)
- Repo dependencies installed (`pnpm install`)

### 1. Start the local node

```bash
pnpm run node:local
```

This runs `docker compose up -d` (Stellar Quickstart in `--local` mode). The first run pulls
the image and boots the network; give it a minute. Wait until the Soroban RPC reports healthy:

```bash
curl -s http://localhost:8000/soroban/rpc \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

Expected output once the node is up (ledger numbers will differ):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "status": "healthy",
    "latestLedger": 321,
    "latestLedgerCloseTime": "1792144052",
    "oldestLedger": 7,
    "oldestLedgerCloseTime": "1792141849",
    "ledgerRetentionWindow": 120960
  }
}
```

### 2. Build the contracts

```bash
pnpm build:contracts
```

Expected output (tail):

```text
Finished `release` profile [optimized] target(s) in 1m 47s
Compilation successful!
```

Confirm the WASM exists:

```bash
ls contracts/target/wasm32v1-none/release/stream.wasm
```

```text
contracts/target/wasm32v1-none/release/stream.wasm
```

### 3. Register the local network and create accounts

Register Quickstart's network with the CLI under the name `local`:

```bash
stellar network add local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"
```

Generate the two identities this walkthrough uses — `deployer` (pays for everything) and
`recipient` (receives the stream):

```bash
stellar keys generate deployer
stellar keys generate recipient
```

Expected output (paths will differ):

```text
✅ Key saved with alias deployer in "/home/you/.config/stellar/identity/deployer.toml"
✅ Key saved with alias recipient in "/home/you/.config/stellar/identity/recipient.toml"
```

Fund both accounts from the local friendbot that ships with Quickstart:

```bash
curl -s "http://localhost:8000/friendbot?addr=$(stellar keys address deployer)" \
  -o /dev/null -w 'deployer funded: HTTP %{http_code}\n'
curl -s "http://localhost:8000/friendbot?addr=$(stellar keys address recipient)" \
  -o /dev/null -w 'recipient funded: HTTP %{http_code}\n'
```

Expected output:

```text
deployer funded: HTTP 200
recipient funded: HTTP 200
```

### 4. Deploy and initialize the stream contract

```bash
STREAM_ID=$(stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/stream.wasm \
  --source-account deployer --network local)
echo "$STREAM_ID"
```

Expected output — the CLI ends with `✅ Deployed!` and prints the new contract id, a `C...`
address (yours will differ):

```text
✅ Deployed!
CATM4LYKBGBLL4NO63663UH44QSJPTXN55RCRISMWE3AN2F3GEHM4U44
```

Initialize the protocol config once (admin and treasury = deployer, no protocol fee). Capture
the deployer address first so the command is self-contained:

```bash
DEPLOYER=$(stellar keys address deployer)
stellar contract invoke --id "$STREAM_ID" --source-account deployer --network local -- \
  initialize --admin "$DEPLOYER" --treasury "$DEPLOYER" --fee_bps 0
```

Expected output — the transaction succeeds and `initialize` returns nothing:

```text
null
```

### 5. Deploy a token to stream

The `stream` contract streams any SEP-41 token. A fresh local node has none, so deploy the
official example token and mint a balance to the deployer. Build the token once:

```bash
git clone --depth 1 https://github.com/stellar/soroban-examples.git /tmp/soroban-examples
(cd /tmp/soroban-examples/token && stellar contract build)
```

Deploy it (the token takes its config as constructor arguments passed after the final `--`):

```bash
TOKEN_ID=$(stellar contract deploy \
  --wasm /tmp/soroban-examples/token/target/wasm32v1-none/release/soroban_token_contract.wasm \
  --source-account deployer --network local -- \
  --admin "$DEPLOYER" --decimal 7 --name "Test Token" --symbol "TT")
echo "$TOKEN_ID"
```

Expected output — a second `C...` address (yours will differ):

```text
✅ Deployed!
CCB43NNWHHJOAMH5R457IWNOJHKEZRJ6T5UPUHMPVBJUSN4BB73OWORP
```

Mint 1,000 TT to the deployer (7 decimals, so 1,000 TT = `100000000000` stroops):

```bash
stellar contract invoke --id "$TOKEN_ID" --source-account deployer --network local -- \
  mint --to "$DEPLOYER" --amount 100000000000
```

Expected output (tail) — a successful mint event:

```text
📅 CCB43NNWHHJOAMH5R457IWNOJHKEZRJ6T5UPUHMPVBJUSN4BB73OWORP - Success - Event: MintWithAmountOnly (mint), to: "GDKTX5CZKL2V542TVURFTQRXDDS5DV7IC3GUQD3CVPMJOMF6DJZY5RDV", amount: "100000000000"
```

### 6. Create a stream

Stream 10 TT from the deployer to the recipient over the next 2 minutes, with no cliff (cliff
= start). The short duration is deliberate — it lets you watch vesting happen in real time:

```bash
RECIPIENT=$(stellar keys address recipient)
NOW=$(date +%s)
stellar contract invoke --id "$STREAM_ID" --source-account deployer --network local -- \
  create_stream \
  --sender "$DEPLOYER" \
  --recipient "$RECIPIENT" \
  --token "$TOKEN_ID" \
  --amount 100000000 \
  --start_time "$NOW" \
  --end_time "$((NOW + 120))" \
  --cliff_time "$NOW"
```

Expected output — two success events (the token transfer into the contract, then the stream
creation) and the new stream id on the last line:

```text
📅 CCB43NNWHHJOAMH5R457IWNOJHKEZRJ6T5UPUHMPVBJUSN4BB73OWORP - Success - Event: [{"symbol":"transfer"},{"address":"GDKTX5CZKL2V542TVURFTQRXDDS5DV7IC3GUQD3CVPMJOMF6DJZY5RDV"},{"address":"CATM4LYKBGBLL4NO63663UH44QSJPTXN55RCRISMWE3AN2F3GEHM4U44"}] = {"map":[{"key":{"symbol":"amount"},"val":{"i128":"100000000"}}]}
📅 CATM4LYKBGBLL4NO63663UH44QSJPTXN55RCRISMWE3AN2F3GEHM4U44 - Success - Event: [{"symbol":"stream"},{"symbol":"created"},{"u64":"1"}] = {"vec":[{"address":"GDKTX5CZKL2V542TVURFTQRXDDS5DV7IC3GUQD3CVPMJOMF6DJZY5RDV"},{"address":"GD467YOIZTC7JQATBD3EBNZLGR5OVY4QN7IKJCUCK2GSBWJJAZWX25RL"},{"i128":"100000000"}]}
1
```

The trailing `1` is the stream id — note it; the next steps use `--stream_id 1`.

### 7. Advance time and watch it vest

Quickstart closes ledgers on the wall clock, so a 2-minute stream vests while you watch. Ask
the contract what the recipient can claim right away:

```bash
stellar contract invoke --id "$STREAM_ID" --source-account deployer --network local -- \
  claimable --stream_id 1
```

Expected output — a few seconds of the stream have already vested (amounts in the token's
smallest unit; 10 TT total = `100000000`):

```text
"10833333"
```

Wait a minute and ask again — the claimable balance has grown:

```bash
sleep 60
stellar contract invoke --id "$STREAM_ID" --source-account deployer --network local -- \
  claimable --stream_id 1
```

Expected output (roughly half the stream after ~60s; the exact number depends on how many
seconds elapsed):

```text
"61666666"
```

### 8. Withdraw

The recipient claims whatever has vested:

```bash
stellar contract invoke --id "$STREAM_ID" --source-account recipient --network local -- \
  withdraw --stream_id 1
```

Expected output — a token transfer from the stream contract to the recipient, a
`stream/withdrawn` event, and the withdrawn amount echoed back:

```text
📅 CCB43NNWHHJOAMH5R457IWNOJHKEZRJ6T5UPUHMPVBJUSN4BB73OWORP - Success - Event: [{"symbol":"transfer"},{"address":"CATM4LYKBGBLL4NO63663UH44QSJPTXN55RCRISMWE3AN2F3GEHM4U44"},{"address":"GD467YOIZTC7JQATBD3EBNZLGR5OVY4QN7IKJCUCK2GSBWJJAZWX25RL"}] = {"map":[{"key":{"symbol":"amount"},"val":{"i128":"70833333"}}]}
📅 CATM4LYKBGBLL4NO63663UH44QSJPTXN55RCRISMWE3AN2F3GEHM4U44 - Success - Event: [{"symbol":"stream"},{"symbol":"withdrawn"},{"u64":"1"}] = {"vec":[{"address":"GD467YOIZTC7JQATBD3EBNZLGR5OVY4QN7IKJCUCK2GSBWJJAZWX25RL"},{"i128":"70833333"},{"i128":"0"}]}
"70833333"
```

Verify the recipient's token balance matches the withdrawn amount:

```bash
stellar contract invoke --id "$TOKEN_ID" --source-account recipient --network local -- \
  balance --id "$(stellar keys address recipient)"
```

Expected output:

```text
"70833333"
```

And confirm the contract stored the withdrawal:

```bash
stellar contract invoke --id "$STREAM_ID" --source-account deployer --network local -- \
  get_stream --stream_id 1
```

Expected output (abridged — timestamps differ; note `withdrawn` is non-zero and `cancelled` is
still `false`):

```json
{
  "cancelled": false,
  "cliff_time": 1792144514,
  "end_time": 1792144634,
  "id": 1,
  "recipient": "GD467YOIZTC7JQATBD3EBNZLGR5OVY4QN7IKJCUCK2GSBWJJAZWX25RL",
  "sender": "GDKTX5CZKL2V542TVURFTQRXDDS5DV7IC3GUQD3CVPMJOMF6DJZY5RDV",
  "start_time": 1792144514,
  "token": "CCB43NNWHHJOAMH5R457IWNOJHKEZRJ6T5UPUHMPVBJUSN4BB73OWORP",
  "total_amount": "100000000",
  "withdrawn": "70833333"
}
```

**"It works" looks like this:** the recipient's token balance equals the last withdrawn amount,
`get_stream` shows a matching non-zero `withdrawn`, and repeating step 8 before `end_time`
withdraws the newly vested remainder. After `end_time`, one final withdraw empties the stream.

### 9. (Optional) Drive the same flow from the dashboard

Point the web app at the local node by creating `apps/web/.env.local` from the local values in
`.env.example` and filling in your ids:

```bash
cp .env.example apps/web/.env.local
```

Then edit `apps/web/.env.local`:

```text
NEXT_PUBLIC_STELLAR_NETWORK=local
NEXT_PUBLIC_HORIZON_URL=http://localhost:8000
NEXT_PUBLIC_SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
NEXT_PUBLIC_STREAM_CONTRACT_ID=<your STREAM_ID from step 4>
NEXT_PUBLIC_TOKEN_CONTRACT_ID=<your TOKEN_ID from step 5>
```

Start the dev server and open the streams page:

```bash
pnpm dev
```

Expected output:

```text
▲ Next.js ...
- Local:        http://localhost:3000
```

Open <http://localhost:3000/streams>, connect a wallet, and create or inspect streams against
the same contract you just drove from the CLI.

### 10. Clean up

Stop the node when you are done:

```bash
pnpm run node:stop
```

The chain state lives in a docker volume and survives restarts. Wipe it completely with:

```bash
docker compose down -v
```
