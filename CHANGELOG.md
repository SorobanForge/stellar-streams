# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-10-07

### Changed

- Repositioned the project from a generic starter kit into **Stellar Streams**, an open protocol for
  payment streaming, vesting, and splits on Stellar.
- Replaced the `counter` demo contract with the flagship `stream` contract (linear vesting with
  cliffs, cancellation, optional protocol fee, TTL bumping, events) and added a `splits` contract.
- Reworked `@stellar-starter-kit/sdk` from a Horizon wrapper stub into a typed `StreamsClient` for
  the stream contract.
- Fixed the `formatStroopsToXlm` precision bug (`Number(bigint)` -> integer math) and corrected the
  testnet passphrase in `.env.example`.
- Removed the vendored `ed25519-dalek` crate; it was not used in the dependency graph.

### Added

- `@stellar-starter-kit/types`: shared Stream/StreamConfig domain types.
- Vesting math (`computeVestedAmount`, `computeProgressBps`) and precise stroop parsing in
  `@stellar-starter-kit/utils`.
- `useStream` React hook.
- `/streams` dashboard for creating, inspecting, withdrawing from, and cancelling streams.
- A dedicated `contracts` CI job running `cargo fmt`, `clippy -D warnings`, and `cargo test`.
- `pnpm node:local`, `pnpm test:contracts`, `pnpm lint:contracts` scripts.

### Removed

- `counter` contract, its generated bindings, and its dashboard page.
- Marketing-only landing components replaced by a focused product page.
- `package-lock.json` (pnpm is the single package manager).

## [Unreleased]

### Added

- Flagship modular Counter smart contract containing `initialize(owner)`, `increment()`, `decrement()`, `reset()`, `get_count()`, and `get_owner()` across dedicated files (`lib.rs`, `storage.rs`, `event.rs`, `error.rs`).
- Robust unit tests in `contracts/counter/src/test.rs` verifying contract errors, bounds limits, state manipulation, and event audits.
- CLI automation command scripts `scripts/invoke-counter.ps1` and `scripts/invoke-counter.sh` to initialize, query, and mutate contract states on Testnet.
- New root package manager script triggers: `pnpm build:contracts`, `pnpm optimize`, `pnpm deploy:counter`, and `pnpm invoke:counter`.
- Root `docker-compose.yml` to support declarative local Stellar Quickstart node management.
- Cross-platform PowerShell helper script `scripts/setup-local-node.ps1` for Windows developers.
- Root `package.json` command script `"node:local": "docker compose up -d"` for quick start-ups.
- Persistent ledger data volume mapping in local docker-compose configuration.
- Flagship multi-party **Escrow smart contract** (`contracts/escrow`) implementing agreement lifecycles (create, fund, release, refund, cancel), state transitions, deadline verification, and event emissions.
- Detailed unit test suite in `contracts/escrow/src/test.rs` covering all happy paths, boundary checks, unauthorized operations, and status validations.
- CLI automation scripts `scripts/invoke-escrow.sh` and `scripts/invoke-escrow.ps1` supporting deployment, validation, and full execution lifecycles on Stellar Testnet.
- Added Next.js 15 Escrow dashboard page (`apps/web/src/app/escrow/page.tsx`) with integrated Freighter connection, creation forms, lifecycle management controls, and real-time execution event logs.
- Added `EscrowClient` exports in `@stellar-starter-kit/contracts` package.
- `create_streams` on the `stream` contract: create up to `MAX_BATCH` (`14`) streams in one
  all-or-nothing call, reusing `create_stream`'s per-stream validation and returning the new ids in
  input order. New `StreamError` codes: `EmptyBatch` (`13`), `BatchTooLarge` (`14`) and
  `BatchOverflow` (`15`).

### Changed

- Migrated frontend counter demo (`apps/web/src/app/counter/page.tsx`) to compile-safe `client.get_count()` calls.
- Overhauled code playground (`CodePlayground.tsx`) on the landing page to showcase `CounterClient` integration snippet.
- Synchronized smart contract build, test, optimize, and deploy guides across `README.md` and `docs/development-guide.md`.
- Updated `scripts/setup-local-node.sh` to check for Docker Compose and use it as default, falling back to raw `docker run` if compose is not present.

## [0.1.0] - 2026-07-09

### Added

- Initial project workspace setup with `pnpm` and `Turborepo`.
- Next.js 15 application workspace scaffolding in `apps/web`.
- TailwindCSS, ESLint, Prettier, TypeScript, and Husky configuration.
- Comprehensive GitHub Issue Templates, Pull Request Template, and Actions workflow (CI).
- Initial project documentation: README, ARCHITECTURE, CONTRIBUTING, ROADMAP, SECURITY, and CODE_OF_CONDUCT.
