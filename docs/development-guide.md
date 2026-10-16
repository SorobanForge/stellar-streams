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

# Check dependency advisories, licenses, bans, and sources with cargo-deny
# (config lives in contracts/deny.toml; CI runs the same check)
cargo deny --manifest-path contracts/Cargo.toml check

# Build optimized WASM for deployment
cargo build --manifest-path contracts/Cargo.toml --target wasm32v1-none --release
```
