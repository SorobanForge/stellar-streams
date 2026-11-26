# Local Development Guide

Welcome to the Stellar Streams developer documentation! This guide explains how to configure your local machine for developing and deploying the protocol's Soroban smart contracts.

---

## Toolchain versions: Node & pnpm

The repository pins **one** Node version and uses it everywhere:

- [`.nvmrc`](../.nvmrc) is the single source of truth (currently **22**). Every GitHub Actions
  `setup-node` step (`ci.yml`, `release.yml`) reads it via `node-version-file`, so local, CI, and
  release can never drift apart.
- `package.json` `engines.node` requires `>=22.0.0`, and `.npmrc` sets `engine-strict=true`, so
  `pnpm install` fails fast with a clear engine error on an unsupported Node version instead of
  letting a locally-passing change fail later in CI.
- After cloning, run `nvm use` (or your version manager's equivalent) to pick up `.nvmrc`.

**Decision (recorded per #163):** Node 18 and 20 support was intentionally dropped. Both are
end-of-life (18 in April 2025, 20 in April 2026), and CI had already standardized on 22. There is
therefore no minimum-version CI matrix — `.nvmrc`, `engines.node`, and the workflows all describe
Node 22. To move the floor later, update `.nvmrc` and `engines.node` together; the workflows follow
`.nvmrc` automatically.

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

Every optimize run prints the optimized size of each contract. Add `--check` to
fail when a contract exceeds its committed budget in
[`contracts/wasm-size-budgets.json`](../contracts/wasm-size-budgets.json):

```bash
pnpm optimize --check
```

CI runs the same gate only when contract-related files change. The budget keeps
headroom below Soroban's 65536-byte contract limit; when a contract legitimately
grows, update its `maxBytes` in the same PR and explain why in the description.

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

### SDK guide (`/docs/sdk.md`)

The SDK guide is the copy-pasteable reference for integrators: it covers creating a
`StreamsClient` in SSR-safe and wallet-backed setups, reading a stream and config, each write
method (`createStream`, `withdraw`, `cancel`), and typed contract errors from the SDK.

Read it alongside the app implementation in `apps/web/src/app/streams/page.tsx` and the typed
client in `packages/sdk/src/index.ts`.

### Component gallery (`/ui`)

The dashboard renders every shared UI primitive — buttons, form controls, badges, alerts,
cards, typography, and the `@stellar-starter-kit/utils` formatting output — in all variants and
states on a single internal page:

```bash
pnpm run dev        # then open http://localhost:3000/ui
```

Use it for design review and screenshot diffing without wiring components into a real flow. The
page lives at `apps/web/src/app/ui/page.tsx`, is reachable by URL only, and is deliberately not
linked from the site header. When you change a class recipe on the `streams` or `escrow` pages,
update the matching recipe in the gallery so the review surface stays accurate. If the team later
wants a richer story, a Storybook migration can be filed as a follow-up — for now the gallery keeps
the dependency footprint at zero.

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
files. It also changes when a test's _setup_ changes, because the accounts a
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
Files listed as modified are stale; files listed as _untracked_ are new
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

---

## 3. Generating the SDK API Reference

`packages/sdk` publishes its full public surface — `StreamsClient` and its
methods, `StreamsError`, `assetContractId`, `StreamsClientOptions`,
`TokenMetadata` and the error-code unions — as an HTML API reference built with
[TypeDoc](https://typedoc.org). Every exported member carries JSDoc with
`@param`, `@returns`, `@throws` and copy-pasteable `@example` blocks, which
TypeDoc renders into the site so contributors can check signatures and usage
against the generated reference instead of only the README snippet.

### Regenerate

```bash
pnpm --filter @stellar-starter-kit/sdk docs
```

This runs `typedoc` with the config at
[`packages/sdk/typedoc.json`](../packages/sdk/typedoc.json) and writes the site
to `docs/api/` (an `index.html` plus per-symbol pages under `classes/`,
`functions/`, `interfaces/` and `types/`).

### The output is not committed

`docs/api/` is a generated artifact and is **gitignored** (see `.gitignore`);
regenerate it locally whenever the SDK's public surface or its doc comments
change, rather than committing the rendered HTML. Add or update the JSDoc on the
exported members in `packages/sdk/src/index.ts` and re-run the command above to
refresh the reference. The build reports `Found 0 errors and 0 warnings` when
every `{@link}` resolves; a broken intra-package link surfaces there as a
warning, not a silent gap.

---

## 4. GitHub Actions Pinning Policy

To guard against supply-chain compromise, all workflows pin third-party actions to full commit SHAs.

### Policy

1. **Third-party actions:** Every `uses:` statement outside the `actions/*` namespace must reference a full 40-character commit SHA, with the human-readable version tag documented in a trailing comment:
   ```yaml
   uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6
   ```
2. **Official actions:** Actions within the `actions/*` namespace (`actions/checkout`, `actions/setup-node`, `actions/cache`) remain on vetted major release tags (`@v7`, `@v6`). These are maintained directly by GitHub infrastructure and reviewed under their security lifecycle.
3. **Auditability:** Pinned SHAs prevent tag-mutation attacks where a compromised tag points to malicious code without altering repository diffs.

### How to Bump a Pinned Action

To bump a pinned action to a new release:

1. Lookup the target release tag and resolve its full commit SHA via the GitHub API or CLI:
   ```bash
   gh api repos/<owner>/<repo>/commits/<tag> --jq '.sha'
   ```
2. Update the workflow file with the returned commit SHA and update the trailing comment:
   ```yaml
   uses: <owner>/<repo>@<new-commit-sha> # <tag>
   ```
3. Run the workflow on a feature branch to verify that inputs and outputs remain compatible before merging to main.

---

## Malware Scan and Supply-Chain Guard

Every pull request is automatically verified against malware and supply-chain threats before merge via `.github/workflows/malware-scan.yml` and `scripts/check-pr-supply-chain.mjs`.

### What Is Checked

- **ClamAV Anti-Malware:** Scans all committed and tracked files against an updated ClamAV database to flag trojans, viruses, and compromised binaries.
- **Supply-Chain Guard:** Analyzes the diff against `origin/main` to detect:
  - Dangerous lifecycle scripts (`preinstall`, `install`, `postinstall`).
  - Registry overrides in `.npmrc`, `.yarnrc`, and `.pnpmfile.cjs`.
  - Committed executable binaries or WASM modules.
  - Suspicious download-and-execute shell one-liners.

### How to Resolve Failures

- **Lifecycle script flagged:** Replace lifecycle scripts in `package.json` with explicit commands in build or test scripts.
- **Registry override flagged:** Remove custom registry URLs or auth tokens from package manager configuration files; all packages must resolve from the public npm registry.
- **Committed binary flagged:** Remove binary files from git tracking. Binaries must be compiled during CI or downloaded dynamically via scripts.
- **ClamAV alert:** Inspect the flagged file. If malicious, remove it immediately. For false positives, reach out to security maintainers.

### Local Reproduction

```bash
# Verify supply-chain diff locally
node scripts/check-pr-supply-chain.mjs --base origin/main

# Verify tracked files with ClamAV locally
git ls-files > /tmp/files-to-scan.txt
clamscan --file-list=/tmp/files-to-scan.txt --infected --no-summary --max-filesize=50M --max-scansize=200M
```

For complete policy and threat analysis, refer to [SECURITY.md](../SECURITY.md#malware-scanning-and-supply-chain-guards).
