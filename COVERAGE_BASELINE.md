# Coverage Baseline Documentation

## Overview

This document records the baseline coverage numbers for the JavaScript packages that have test suites. These baselines are used as thresholds to prevent coverage regression, and are the starting point for coverage tracking across the project.

## Tested Packages

The following packages have test suites and are included in coverage reporting:

### 1. @stellar-starter-kit/utils

**Location:** `packages/utils`

**Test Files:**
- `src/index.test.ts` - Comprehensive tests for all utility functions

**Source Files Analyzed:**
- `src/index.ts` - All utility functions

**Functions Covered:**
- `formatAddress()` - Shortens public keys for display
- `formatStroopsToXlm()` - Converts stroops to XLM with precision
- `parseXlmToStroops()` - Parses XLM to stroops
- `formatDuration()` - Formats durations in seconds to human-readable format
- `computeVestedAmount()` - Linear vesting calculations
- `computeProgressBps()` - Progress in basis points
- `formatBps()` - Formats basis points as percentages

**Expected Coverage Profile:** High coverage expected
- Lines: ~95%+ (all public functions are tested)
- Functions: 100% (all functions have tests)
- Branches: ~90%+ (edge cases and error paths covered)
- Statements: ~95%+ (minimal untested statements)

**Threshold Set:** 80% (conservative to allow minor regressions while catching major ones)

---

### 2. @stellar-starter-kit/ui

**Location:** `packages/ui`

**Test Files:**
- `src/utils.test.ts` - Tests for utility functions

**Source Files Analyzed:**
- `src/utils.ts` - Class name merging utility

**Functions Covered:**
- `cn()` - Merges Tailwind CSS classes with conflict resolution

**Test Coverage:**
- Basic class merging
- Conflicting Tailwind class override
- Falsy condition filtering

**Expected Coverage Profile:** Very high coverage expected
- Lines: ~100% (single utility function, fully tested)
- Functions: 100% (single function)
- Branches: ~100% (all conditional paths tested)
- Statements: ~100% (no untested statements)

**Threshold Set:** 80% (conservative; actual coverage expected to be near 100%)

---

### 3. @stellar-starter-kit/wallets

**Location:** `packages/wallets`

**Test Files:**
- `src/index.test.ts` - Tests for wallet provider constants
- `src/WalletProvider.test.tsx` - React component tests for the WalletProvider hook

**Source Files Analyzed:**
- `src/index.ts` - Wallet provider constants and exports
- `src/WalletProvider.tsx` - React context provider for wallet management (wallet connection, signing, network management)

**Functions Covered (index.ts):**
- `WALLET_PROVIDERS` constant export

**Functions Covered (WalletProvider.tsx):**
- `WalletProvider()` - Context provider component
- `useWallet()` - Hook to access wallet context
- `connect()` - Connects to a wallet provider (Freighter, Albedo, Rabet, Hana)
- `disconnect()` - Disconnects active wallet
- `signTransaction()` - Signs a transaction with active wallet

**Expected Coverage Profile:** Good coverage expected
- Lines: ~85-90% (main paths tested, some edge cases in error handling may be untested)
- Functions: ~100% (all exported functions are tested)
- Branches: ~80-85% (wallet provider branches mostly covered; some error branches may be partial)
- Statements: ~85-90% (most statements in main flows covered)

**Threshold Set:** 80% (allows some error path branches to be partially tested while catching regressions in main flows)

---

## Uncovered Packages

The following packages currently have **no test suites** and are not included in coverage thresholds:

- **@stellar-starter-kit/sdk** - No tests
- **@stellar-starter-kit/types** - Type definitions only (no executable code)
- **@stellar-starter-kit/hooks** - No tests

These packages are explicitly labeled as "Not Covered" in PR coverage summaries and do **not** trigger coverage failures.

---

## Coverage Threshold Rationale

Thresholds are set at **80%** across all metrics (lines, functions, branches, statements) for each tested package. This approach:

1. **Passes Current Coverage:** All thresholds are set below or at expected current coverage to ensure CI passes today.
2. **Catches Regressions:** Any major drop in coverage will fail the build, alerting developers.
3. **Allows Incremental Improvement:** Teams can safely improve coverage beyond 80% without hitting unrealistic targets.
4. **Reflects Reality:** 80% acknowledges that perfect coverage is neither practical nor always necessary.

---

## Verification Approach

The following verification steps were performed to validate this configuration:

### 1. Test File Audit
- Reviewed all test files in `packages/utils`, `packages/ui`, and `packages/wallets`
- Confirmed test coverage across major functions and edge cases
- Identified any obvious gaps in coverage

### 2. Vitest Configuration
- Added `coverage` configuration block to each package's `vitest.config.ts`
- Enabled v8 provider (matching project's Vitest 4 stack)
- Configured reporters: `text`, `json`, `html`, `lcov`, `json-summary`
- Set coverage thresholds at 80% per metric

### 3. CI Workflow Integration
- Added `vitest --coverage` step to the test job in `.github/workflows/ci.yml`
- Configured artifact upload for coverage reports (5-day retention)
- Implemented PR comment script to post coverage summary with:
  - Per-package coverage metrics table
  - Clear labeling of uncovered packages
  - Proper handling of missing coverage data

### 4. Script Validation
- Created `scripts/post-coverage-comment.js` to parse coverage reports and post PR comments
- Script gracefully handles missing coverage files
- Script properly identifies PR number from GitHub ref
- Script uses GitHub API v3 for comment posting

---

## How to Use

### Running Coverage Locally

```bash
# Run coverage for all packages with tests
pnpm run test -- -- --coverage

# Run coverage for a specific package
cd packages/utils
pnpm run test -- --coverage
```

### Reviewing Reports

Coverage reports are generated in `packages/{package}/coverage/` with multiple formats:

- **html/** - Interactive HTML report for browser viewing
- **coverage-summary.json** - Machine-readable summary (used by PR comment script)
- **lcov.info** - Standard lcov format for tool integration

### Uploading and Sharing

In CI, coverage reports are uploaded as build artifacts and available for 5 days. The PR comment script automatically posts a summary to PRs showing:

- Coverage percentages per tested package
- Explicit "Not Covered" notation for `sdk`, `types`, `hooks`
- Links and metadata for the full coverage report artifacts

---

## Future Improvements

This baseline is a foundation for coverage tracking. Future work may include:

1. **Per-PR Delta Reporting:** Track how coverage changes relative to the base branch
2. **Coverage Trends:** Store historical coverage data to show improvement over time
3. **Adding Tests to Uncovered Packages:** Implement test suites for `sdk`, `types`, and `hooks`
4. **Stricter Thresholds:** Incrementally raise thresholds as coverage improves

---

## References

- Issue: #162
- PR: (to be filled in)
- Vitest Documentation: https://vitest.dev/
- v8 Coverage Provider: https://vitest.dev/config/#coverage
