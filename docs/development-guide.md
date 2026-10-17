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

### Test snapshots

Each contract commits the Soroban test ledger state produced by its unit tests
under `contracts/<contract>/test_snapshots/test/<test_name>.1.json`. The
soroban-test SDK writes these files during `cargo test`, so **running the tests
is the regeneration command** — there is no separate generate step:

```bash
# Regenerate every snapshot for every contract
cargo test --manifest-path contracts/Cargo.toml

# Regenerate only one crate's snapshots
cargo test --manifest-path contracts/Cargo.toml -p stream
```

A snapshot is a record of the ledgers, storage, events and token balances a test
left behind, so it changes whenever the behaviour under test changes: adding a
storage write, bumping a TTL, or editing an event payload rewrites the affected
files. It also changes when a test's *setup* changes, because the accounts a
test uses are derived from the order in which they are registered — moving a
`register_contract`/`AccountProvider::generate()` call rewrites every address,
contract id and nonce in that crate's snapshots. Commit the rewritten files
together with the test that produced them — see
[CONTRIBUTING.md](../CONTRIBUTING.md).

To confirm the committed snapshots are current, run the tests and check that
nothing is dirty:

```bash
cargo test --manifest-path contracts/Cargo.toml && git status --short contracts/*/test_snapshots
```

An empty output means the snapshots on disk match what the tests generate.
Files listed as modified are stale; files listed as *untracked* are new
snapshots for tests that did not exist before.

Orphaned snapshots — a file whose test has since been deleted or renamed — are
not removed automatically; the SDK only ever writes. `test_snapshots/test/`
should contain exactly one `<name>.1.json` per `#[test]` in `src/test.rs`, so
diff the two sets to find leftovers and delete them by hand:

```bash
ls contracts/stream/test_snapshots/test | sed 's/\.1\.json$//' | sort
grep -oP '(?<=fn )\w+(?=\(\))' contracts/stream/src/test.rs | sort
```

A name in the first list but not the second is an orphan; in the second but not
the first means the snapshot is simply missing and one test run will create it.
