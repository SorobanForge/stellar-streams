# CI Check Reference and Local Reproduction

This document provides a comprehensive reference for all CI checks executed on pull requests in the Stellar Streams repository. Every check corresponds to a required or advisory status check in GitHub Actions.

---

## Status Checks Summary

| Job Context                         | Workflow File                        | What It Runs                                                                                            | Local Reproduction Command                                                                  |
| :---------------------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------ |
| **Lint Codebase**                   | `.github/workflows/ci.yml`           | ESLint across TypeScript / JavaScript files and Prettier format check.                                  | `pnpm run lint` and `pnpm run format:check`                                                 |
| **Run TypeScript Checks**           | `.github/workflows/ci.yml`           | TypeScript compilation typechecking (`tsc --noEmit`) across all monorepo packages.                      | `pnpm run typecheck`                                                                        |
| **Run Unit Tests**                  | `.github/workflows/ci.yml`           | Vitest unit and integration test suites across packages.                                                | `pnpm --filter <package> test --run`                                                        |
| **Test Soroban Contracts**          | `.github/workflows/ci.yml`           | Rust formatting (`cargo fmt`), clippy linter, and Soroban contract tests.                               | `pnpm run fmt:contracts && pnpm run lint:contracts && pnpm run test:contracts`              |
| **Check Dependencies (cargo-deny)** | `.github/workflows/ci.yml`           | Checks Rust contract dependencies against security advisories, bans, and license restrictions.          | `cargo-deny check --manifest-path contracts/Cargo.toml`                                     |
| **Verify Production Build**         | `.github/workflows/ci.yml`           | Production Next.js build and package exports verification.                                              | `pnpm run build && pnpm run test:exports`                                                   |
| **Check Documentation Links**       | `.github/workflows/docs.yml`         | Lychee link checker across all Markdown documentation files.                                            | `lychee --config .lychee.toml './**/*.md'`                                                  |
| **Scan PR for Malware**             | `.github/workflows/malware-scan.yml` | ClamAV virus scanning across all tracked files in git.                                                  | `git ls-files > files.txt && clamscan --file-list=files.txt --infected --no-summary`        |
| **Check Supply-Chain Changes**      | `.github/workflows/malware-scan.yml` | Inspects pull request diffs for malicious lifecycle scripts, registry overrides, or committed binaries. | `node scripts/check-pr-supply-chain.mjs --base origin/main`                                 |
| **Scan PR for Secrets**             | `.github/workflows/secret-scan.yml`  | Gitleaks scan over PR commits for accidentally committed credentials.                                   | `gitleaks detect --config .gitleaks.toml --log-opts="origin/main..HEAD" --redact --verbose` |

---

## Details, Failure Modes, and Known False Positives

### 1. Lint Codebase (`lint`)

- **What it checks:** Code style, TypeScript best practices, and Prettier formatting across code and Markdown documentation.
- **Common pitfall:** Prettier format checks include Markdown files (`.md`) and JSON files (`.json`). If you update documentation without running Prettier, this check will fail.
- **Fix:** Run `pnpm run format:write` to format all files automatically.

### 2. Run TypeScript Checks (`typecheck`)

- **What it checks:** Validates TypeScript types across the monorepo via Turborepo.
- **Common pitfall:** Changes in `packages/types` or `packages/contracts` might require rebuilding before dependent packages can resolve types cleanly.
- **Fix:** Run `pnpm run build` or `pnpm run typecheck` to locate type errors.

### 3. Run Unit Tests (`test`)

- **What it checks:** Executes unit tests using Vitest across all packages.
- **Common pitfall:** Running root `pnpm test` without flags may trigger interactive watch mode.
- **Fix:** Run `pnpm --filter <package> test --run` or `vitest run` to run in non-interactive mode.

### 4. Test Soroban Contracts (`contracts`)

- **What it checks:** Contract formatting, clippy warnings treated as errors, and contract unit tests.
- **Common pitfall:** Contract unit tests generate ledger snapshot files stored under `contracts/<contract>/test_snapshots/`. When tests are added, modified, or deleted, snapshots must be committed with the test change. Stale or orphaned snapshots cause CI failures.
- **Fix:** Run `cargo test --manifest-path contracts/Cargo.toml` locally, review snapshot diffs, and commit updated snapshots.

### 5. Check Dependencies (`cargo-deny`)

- **What it checks:** Security advisories and duplicate dependencies in `contracts/Cargo.lock`.
- **Common pitfall:** Upgrading or adding a crate that brings an untrusted license or duplicate sub-dependency.
- **Fix:** Inspect `contracts/deny.toml` and run `cargo-deny check --manifest-path contracts/Cargo.toml`.

### 6. Verify Production Build (`build`)

- **What it checks:** Full production build and package entry point verification via `scripts/check-package-entries.mjs`.
- **Common pitfall:** Modifying `package.json` entry points (`exports`, `main`, `types`) without corresponding build output.
- **Fix:** Run `pnpm run test:exports` locally to verify exports.

### 7. Check Documentation Links (`docs`)

- **What it checks:** Verifies internal and external hyperlinks in Markdown documents using Lychee.
- **Common pitfall (False Positive):** External URLs that enforce strict bot mitigation (HTTP 403) or JSON-RPC endpoints that reject GET requests.
- **Fix:** Scoped exclusions can be added with an explanatory comment in `.lychee.toml` under `exclude = [...]`.

### 8. Scan PR for Malware (`clamav`)

- **What it checks:** Scans tracked git files against ClamAV virus signatures.
- **Common pitfall (False Positive):** Binary test fixtures or high-entropy test fixtures that trigger heuristic signature rules.
- **Fix:** If a false positive is identified in a legitimate test fixture, report the file and hash to `ademolabuild@gmail.com` for review.

### 9. Check Supply-Chain Changes (`supply-chain`)

- **What it checks:** Heuristically detects dangerous lifecycle scripts (`preinstall`, `install`, `postinstall`), npm registry redirects, and committed binaries.
- **Common pitfall:** Adding install-time scripts in package manifests or committing compiled binary files.
- **Fix:** Shift install scripts to explicit development or build tasks (such as `pnpm build`), and ensure compiled binaries are generated during build steps rather than committed to git.

### 10. Scan PR for Secrets (`gitleaks`)

- **What it checks:** Scans pull request commit ranges for credentials, private keys, and API tokens.
- **Common pitfall (False Positive):** High-entropy public Stellar identifiers such as Contract IDs (`C...`) or Account Public Keys (`G...`).
- **Fix:** Public Stellar identifiers and vendored patches are allowlisted in `.gitleaks.toml`. Real private keys (`S...`) must never be committed.
