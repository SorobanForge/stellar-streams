# Stellar Streams Documentation Index

Welcome to the Stellar Streams protocol documentation. Use this index to navigate the technical guides, specifications, and migration instructions.

---

## Documentation Directory

| Document                                            | Description                                                                                                                                                                        |
| :-------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Migration Guide](migration.md)**                 | Step-by-step guide for migrating from `@stellar-starter-kit/*` to `@stellar-streams/*`, including an import mapping table, copy-pasteable codemods, and behaviour changes.         |
| **[Contract Reference](contracts.md)**              | Comprehensive specification for all Soroban smart contracts (`stream`, `splits`, `escrow`), detailing functions, arguments, return types, numeric error codes, and event payloads. |
| **[Local Development Guide](development-guide.md)** | Instructions for setting up local development with Docker, Stellar Quickstart, Soroban CLI, testing, and snapshot verification.                                                    |
| **[Deployments](deployments.md)**                   | Testnet and Mainnet contract IDs, deployment ledger sequences, and explorer links.                                                                                                 |
| **[Good First Issues](good-first-issues.md)**       | Curated roadmap of beginner and contributor tasks across contracts, SDK, and web dashboard.                                                                                        |

---

## Package References

- **SDK (`packages/sdk`)**: Typed client for simulation, wallet signing, and Soroban interaction ([SDK README](../packages/sdk/README.md)).
- **Types (`packages/types`)**: Core protocol interfaces and domain models.
- **Utils (`packages/utils`)**: Stroop/token formatting, BigInt math, and vesting curve chart generator (`vestingCurve`).
- **Contracts (`packages/contracts`)**: Pre-generated TypeScript contract client bindings for `stream`, `splits`, and `escrow`.
- **Wallets (`packages/wallets`)**: Multi-wallet connector integration supporting Freighter, Albedo, Rabet, and Hana.
- **Web App (`apps/web`)**: Next.js 15 dashboard for stream creation, management, and escrow operations.
