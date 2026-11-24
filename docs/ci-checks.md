# CI Checks Reference

Every pull request runs the same guard rails, and ten of them are **required
status checks** on `main` ([`scripts/setup-branch-protection.sh`](../scripts/setup-branch-protection.sh)).
This page lists each one, what it actually runs, how to reproduce it locally
before pushing, and the known cases where a red check does not mean broken code.

Match CI's toolchain when reproducing locally: Node 22 (`.nvmrc`), pnpm 9.4.0,
and `pnpm install --frozen-lockfile` rather than a plain `pnpm install`.

## Required checks

| Check                      | Workflow           | What it runs                                                                                                                               | Reproduce locally                          |
| :------------------------- | :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| Lint Codebase              | `ci.yml`           | ESLint for every package and app, then Prettier's formatting check (Markdown included)                                                     | `pnpm run lint && pnpm run format:check`   |
| Run TypeScript Checks      | `ci.yml`           | `tsc --noEmit` for every workspace that has a `typecheck` script                                                                           | `pnpm run typecheck`                       |
| Run Unit Tests             | `ci.yml`           | Vitest suites for the packages and `apps/web`                                                                                              | `pnpm run test`                            |
| Test Soroban Contracts     | `ci.yml`           | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` (which regenerates `test_snapshots/`)                                        | see [Contracts](#test-soroban-contracts)   |
| Check Generated Bindings   | `ci.yml`           | Regenerates the committed contract clients with a pinned Stellar CLI and fails on any diff (skipped when no contract-related files change) | `pnpm run generate:bindings`               |
| Verify Production Build    | `ci.yml`           | `turbo run build`, then `scripts/check-package-entries.mjs`                                                                                | `pnpm run build && pnpm run test:exports`  |
| Check Documentation Links  | `docs.yml`         | lychee over every committed Markdown file, including `#fragment` anchors                                                                   | `lychee --config .lychee.toml './**/*.md'` |
| Scan PR for Malware        | `malware-scan.yml` | ClamAV over `git ls-files`, with a current signature database                                                                              | see [Malware scan](#scan-pr-for-malware)   |
| Check Supply-Chain Changes | `malware-scan.yml` | `scripts/check-pr-supply-chain.mjs` over the PR diff                                                                                       | `node scripts/check-pr-supply-chain.mjs`   |
| Scan PR for Secrets        | `secret-scan.yml`  | gitleaks on the PR's own commits, with `.gitleaks.toml`                                                                                    | see [Secret scan](#scan-pr-for-secrets)    |

The job names in the **Check** column are the exact status-check contexts. A
renamed workflow job silently drops out of branch protection until
`scripts/setup-branch-protection.sh` is updated to match.

## Jobs that report but do not block

These run on a pull request as well. They are not required contexts, but a
failing check still needs a fix or an explanation on the PR.

| Check                           | Workflow       | Why it is not required                                                                                   |
| :------------------------------ | :------------- | :------------------------------------------------------------------------------------------------------- |
| Check Dependencies (cargo-deny) | `ci.yml`       | Rust advisory/licence/source policy; can fail on an advisory with no fix available, so it stays advisory |
| Analyze Codebase (CodeQL)       | `codeql.yml`   | Security analysis that runs on a schedule as well as on PRs                                              |
| Validate PR Title               | `pr-check.yml` | Enforces the Conventional Commits type prefix (`feat(web): …`); convention rather than build output      |

## Local pre-flight

One pass, in the same order CI runs them:

```bash
pnpm install --frozen-lockfile

pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:exports

cargo fmt --manifest-path contracts/Cargo.toml --all -- --check
cargo clippy --manifest-path contracts/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path contracts/Cargo.toml

node scripts/check-pr-supply-chain.mjs --base origin/main
```

The scan jobs need tooling that CI installs itself; their commands are in the
sections below.

## Dependency caching

Every job that installs Node or Rust dependencies restores a cache keyed on a
committed lockfile, so a cache hit skips re-downloading packages and a cache
miss still produces a correct build:

| Cache                                                | Tool                                                                | Key                                                                       |
| :--------------------------------------------------- | :------------------------------------------------------------------ | :------------------------------------------------------------------------ |
| pnpm content-addressable store                       | `actions/setup-node` with `cache: pnpm` and `cache-dependency-path` | `pnpm-lock.yaml`                                                          |
| Cargo registry, git checkout, and `contracts/target` | `Swatinem/rust-cache` (`workspaces: contracts`)                     | `contracts/Cargo.lock`, the Rust toolchain version, and the target triple |

The Node jobs cover **Lint Codebase**, **Run TypeScript Checks**, **Run Unit
Tests**, **Verify Production Build**, and the release workflow. The Rust cache
covers **Test Soroban Contracts**, **Check Generated Bindings**, and the Rust
leg of CodeQL.

`contracts/Cargo.lock` is committed for the same reason as `pnpm-lock.yaml`:
it pins the dependency graph that CI builds and tests, and gives the Rust cache
a stable, committed key. Update it with `cargo update` when contract
dependencies change, and commit it in the same PR.

The bindings job's pinned Stellar CLI download is not cached; it is fetched on
each run so a stale binary can never hide a binding-generation regression.

## Details

### Lint Codebase

Two independent steps, so a formatting-only drift fails the same job as a lint
error.

- `pnpm run lint` runs ESLint (Turborepo fans it out per workspace).
- `pnpm run format:check` runs Prettier over the repository. **Markdown is
  included**, so a doc edit with a hand-aligned table or a long unwrapped table
  row fails this check as readily as a stray semicolon does.

Fix formatting with `pnpm run format:write` instead of editing whitespace by
hand; Prettier owns the column widths in Markdown tables. The `lint-staged`
pre-commit hook runs both tools on staged files.

### Run TypeScript Checks

`tsc --noEmit` in each workspace. The Turbo `typecheck` task depends on
`^build`, so a stale `dist/` from a previous build can surface here as a type
error that only exists in generated output: rerun `pnpm run build` before
debugging.

### Run Unit Tests

`turbo run test`, which is `vitest run` per workspace. Focus a suite while
iterating with `pnpm --filter @stellar-starter-kit/sdk test`, then run the full
command before pushing.

### Test Soroban Contracts

```bash
cargo fmt --manifest-path contracts/Cargo.toml --all -- --check
cargo clippy --manifest-path contracts/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path contracts/Cargo.toml
```

`cargo test` writes (and rewrites) `contracts/<contract>/test_snapshots/`. A PR
that adds or edits a contract test must **commit the regenerated snapshots with
it**, and must delete the snapshots of renamed or removed tests — Soroban only
writes, it never prunes. Note that the CI job itself does not fail on that diff:
the regenerated files stay in the runner's working tree, so a missing snapshot
is a review problem, not a red check. Verify locally with:

```bash
cargo test --manifest-path contracts/Cargo.toml
git status --short contracts/*/test_snapshots
```

An empty output means the committed snapshots match what the tests generate. See
the [development guide](development-guide.md#test-snapshots) for stale and
orphaned snapshots.

### Check Generated Bindings

The committed clients under `packages/contracts/src/generated/` must match the
contract source; otherwise the shipped bindings disagree with the deployed WASM.
When a PR changes `contracts/`, the generated bindings, or the binding
generator, this job:

1. installs the pinned Stellar CLI (`STELLAR_CLI_VERSION` in `ci.yml`),
2. runs `pnpm generate:bindings`, which builds the WASM and regenerates all
   three clients,
3. stages `packages/contracts/src/generated/` and fails with a `Stale generated
bindings` annotation listing the changed files if regeneration produced a
   diff.

On PRs that touch nothing contract-related the job is reported as **skipped**
instead of paying for a multi-minute Rust build; a skipped required check does
not block the merge.

Reproduce locally with the [Stellar CLI](https://github.com/stellar/stellar-cli/releases)
on your `PATH`:

```bash
pnpm generate:bindings
git status --short packages/contracts/src/generated
```

A non-empty status means the bindings are stale: commit the regenerated files
with the contract change. CI pins the CLI version because each generated
`package.json` embeds the CLI's own `@stellar/stellar-sdk` version, so
regenerating with a different version adds diff noise unrelated to the contract.

### Verify Production Build

`pnpm run build` (Turbo, building dependencies first) followed by
`pnpm run test:exports`, which asserts every package's `exports`/`types`
entry points resolve in the built output. Adding a source file without exporting
it, or changing a `package.json` `exports` map without rebuilding, fails here.

### Check Documentation Links

`lychee --config .lychee.toml --no-progress --verbose './**/*.md'`. Fragments
are checked too, so renaming a heading breaks links that point at it. The
workflow deliberately has no `paths:` filter: a path-filtered required check
never reports on unrelated PRs, which would block every merge.

### Scan PR for Malware

ClamAV scans only tracked files (`git ls-files`), not `node_modules`, `.next` or
`dist`. The job fails when the scanner cannot update its signatures, so a
`freshclam` outage reads as a scan failure rather than a silent pass.

```bash
# Linux/macOS with clamscan installed
git ls-files > /tmp/files-to-scan.txt
clamscan --file-list=/tmp/files-to-scan.txt --infected --no-summary
```

### Check Supply-Chain Changes

`node scripts/check-pr-supply-chain.mjs --base origin/main` diffs the PR against
the base branch and looks for install-time lifecycle scripts, registry/auth
overrides, committed executables and download-and-execute one-liners. Hard
findings fail; merely suspicious patterns are emitted as warnings that a
reviewer should read.

### Scan PR for Secrets

`gitleaks detect` over the PR's commit range, with `.gitleaks.toml` extending
the default ruleset.

```bash
docker run --rm -v "$PWD:/repo" -w /repo ghcr.io/gitleaks/gitleaks:v8.30.1 \
  detect --config /repo/.gitleaks.toml --source /repo \
  --log-opts="origin/main..HEAD" --redact --verbose --no-banner
```

## Known false positives

### ClamAV flags a test fixture or binary-looking file

ClamAV matches signatures, so a deliberately infected fixture, a minified
bundle, or an archive of test data can trip it. Confirm the file by scanning it
directly, and if it is a genuine test fixture, keep it out of the repository
(or store it as inert base64/text) rather than adding a scanner exclusion. If a
real, non-executable payload must be committed, raise it with the maintainers
first — `SECURITY.md` describes the private reporting path for anything that is
actually malicious.

A `freshclam`/network failure in the job is transient: rerun the job.

### gitleaks reports a Stellar key

Account public keys (`G...`) and contract ids (`C...`) are public and already
allowlisted by the `[CG][A-Z0-9]{55}` regex in `.gitleaks.toml`. A finding that
is **not** a public identifier is either a real secret — rotate it before doing
anything else — or a narrowly scoped allowlist addition. Read
[the triage guide](triage.md) before editing `.gitleaks.toml`: every entry needs
a comment saying why the value cannot be a credential.

### Supply-chain warnings on documentation examples

`curl … | sh` and similar one-liners inside docs or examples are reported as
annotations, not failures. They are expected in install instructions; only
hard findings (a new lifecycle script, a registry override, an executable) block
the check.

If a new dependency legitimately ships an install script, the job fails by
design. Prefer a package that does not need one; if there is no alternative,
call it out in the PR description so a reviewer approves the exception
deliberately.

### lychee fails on an external site

The config already excludes hosts that reject automated clients (`npmjs.com`
403s, Shields badges, `contrib.rocks`, the POST-only Soroban RPC endpoint and
the client-side Laboratory fragment). `429` is accepted as a transient rate
limit. For a genuinely flaky host, rerun the job first; only then add a narrowly
scoped `exclude` entry to `.lychee.toml` with a comment explaining why the URL
cannot be checked.

### cargo-deny reports an advisory or licence

The advisory may have no fixed version yet. Check whether the crate is reachable
from a deployed contract; if it is not, note that in the PR. Suppressions belong
in `contracts/deny.toml` with a note saying when the exception can be dropped,
not in a workflow edit.

### Prettier rewrites a Markdown table

Expected. `pnpm run format:write` is the fix; Prettier aligns every table column
to the widest cell, which is why hand-padded tables drift.
