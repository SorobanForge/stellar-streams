# Issue Triage & Labeling Guide

This guide explains how to triage issues, apply labels, and understand the contribution workflow in the Stellar Streams repository.

## Table of Contents

- [Label Taxonomy](#label-taxonomy)
- [Issue Lifecycle & Status](#issue-lifecycle--status)
- [Triage Workflow](#triage-workflow)
- [Response Expectations](#response-expectations)
- [Setting Up Labels](#setting-up-labels)

---

## Label Taxonomy

Labels are organized into six categories to help organize, prioritize, and route work:

### Type Labels (`type:`)

Describes the nature of the work.

| Label | Color | Description | Use When |
|-------|-------|-------------|----------|
| `type: bug` | 🔴 Red | Something isn't working as expected | A defect is reported; existing behavior is incorrect |
| `type: feature` | 🔵 Cyan | New features, capabilities, or major enhancements | A new capability is requested; something new should be built |
| `type: documentation` | 🔵 Blue | Improvements or additions to documentation or guides | Docs are missing, outdated, or unclear |
| `type: chore` | ⚫ Gray | Repository maintenance, dependencies, lints, or minor tweaks | Deps need updating, build scripts need tweaking, housekeeping |
| `type: performance` | 🔵 Light Blue | Code changes that improve CPU, memory, or bundle size performance | Optimizations are needed; metrics show slowness or bloat |
| `type: security` | 🔴 Dark Red | Security issues, vulnerability updates, or audits | A vulnerability is found; security best practices apply |
| `type: refactor` | 🟣 Purple | Code structure refactorings without behavior modifications | Code needs restructuring for clarity or maintainability |
| `type: test` | 🔴 Light Red | Adding missing tests or improving existing test suites | Test coverage is low; existing tests need improvement |

**Example:** A user reports that the wallet connection hook fails on Firefox → `type: bug`

### Area Labels (`area:`)

Indicates which codebase area or package is affected.

| Label | Description |
|-------|-------------|
| `area: cli` | Packages/cli command-line tools and scripts |
| `area: config` | Packages/config configuration system |
| `area: contracts` | Packages/contracts Soroban smart contracts |
| `area: core` | Packages/core core logic and connections |
| `area: hooks` | Packages/hooks React hooks and state management |
| `area: sdk` | Packages/sdk developer client modules |
| `area: testing` | Packages/testing mock environments and simulators |
| `area: ui` | Packages/ui Tailwind UI components |
| `area: utils` | Packages/utils helpers and converters |
| `area: wallets` | Packages/wallets wallet adapter integrations |
| `area: web` | Apps/web Next.js views and API routes |

**Example:** A dropdown component doesn't render correctly → `area: ui`

### Priority Labels (`priority:`)

Reflects business and product importance.

| Label | Color | Definition | Timeline |
|-------|-------|-----------|----------|
| `priority: critical (p0)` | 🔴 Dark Red | Blocks releases, production deployment, or breaks core APIs | Fix immediately; ASAP |
| `priority: high (p1)` | 🔴 Orange | Important feature request or high-visibility bug fix | Within 1–2 weeks |
| `priority: medium (p2)` | 🟡 Yellow | Standard issues, enhancements, or bug fixes | Within 1 month |
| `priority: low (p3)` | 🟢 Green | Minor bug fixes, nice-to-have features, or chores | When bandwidth available |

**Example:** The escrow contract has a logic error that loses user funds → `priority: critical (p0)`

### Status Labels (`status:`)

Tracks progress through the contribution lifecycle (see [Issue Lifecycle](#issue-lifecycle--status)).

| Label | Color | Meaning |
|-------|-------|---------|
| `status: triaged` | 🟢 Light Green | Acknowledged, verified, and prioritized by maintainers |
| `status: in-progress` | 🔴 Hot Pink | Work is active or currently being drafted |
| `status: review-needed` | 🟡 Yellow | Implementation complete; awaiting review approval |
| `status: blocked` | 🔴 Red | Work is blocked by an external dependency or another issue |

**Related Status Labels:**

| Label | Color | Meaning |
|-------|-------|---------|
| `status: help-wanted` | 🟢 Teal | Extra attention or community help is requested |
| `status: good-first-issue` | 🟣 Purple | Good starting point for new contributors |

### Difficulty Labels (`difficulty:`)

Signals the expected effort and required expertise.

| Label | Color | Qualifications | Example |
|-------|-------|-----------------|---------|
| `difficulty: easy` | 🟢 Light Green | Simple task; minimal codebase knowledge | Update a README; fix a typo; add a config option |
| `difficulty: medium` | 🟡 Yellow | Standard developer task; basic codebase context | Add a new utility function; fix a localized bug; add tests |
| `difficulty: hard` | 🟠 Light Orange | Complex architecture changes; deep understanding | Redesign state management; refactor contract logic; new SDK pattern |

**Examples by Difficulty:**

- **Easy:** "docs: fix typo in README"
- **Medium:** "feat(utils): add formatTimestamp helper function"
- **Hard:** "refactor(core): redesign transaction signing to support hardware wallets"

### Ecosystem Labels (`ecosystem:`)

Indicates integration points with the Stellar ecosystem.

| Label | Description |
|-------|-------------|
| `ecosystem: soroban` | Soroban WebAssembly smart contract interactions |
| `ecosystem: horizon` | Horizon server endpoints and REST transactions API |
| `ecosystem: quickstart` | Stellar quickstart docker container configurations |

---

## Issue Lifecycle & Status

All issues follow a five-stage lifecycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Issue Lifecycle                              │
└─────────────────────────────────────────────────────────────────┘

1. Opened
   └─→ Reporter submits issue
       Labels: type:, area:
       Status: (none yet)

2. Triaged ✓
   └─→ Maintainers verify, assess impact, and prioritize
       Labels: type:, area:, priority:, difficulty:
       Status: `status: triaged`

3. Assigned / In-Progress
   └─→ Contributor claims or is assigned the issue
       Labels: (unchanged from triage) + `status: in-progress`
       Status: `status: in-progress`

4. Review-Needed
   └─→ Implementation is complete; PR is opened and awaiting approval
       Labels: (unchanged)
       Status: `status: review-needed` (on PR)

5. Closed / Merged
   └─→ Issue is resolved (PR merged or issue wontfix/duplicate/etc)
       Labels: (unchanged)
       Status: (label removed)
```

### Detailed States

#### 1. **Opened**
- A new issue is created by a community member or maintainer.
- **Apply immediately:**
  - `type: *` (required)
  - `area: *` (if clear)
- **Do not apply yet:**
  - `status: triaged`, `priority: *`, `difficulty: *`

#### 2. **Triaged**
- A maintainer has reviewed and verified the issue.
- **Steps:**
  1. Understand the problem and verify it can be reproduced.
  2. Classify with `priority: *` and `difficulty: *`.
  3. Add any additional `area: *` or `ecosystem: *` labels if relevant.
  4. Comment with a summary of the issue (scope, next steps, blockers).
  5. Apply `status: triaged`.
- **If blocked:** Apply `status: blocked` instead, and link the blocking issue/dependency.
- **If help is needed:** Add `status: help-wanted` to encourage community participation.
- **If good for newcomers:** Add `status: good-first-issue`.

#### 3. **In-Progress**
- A contributor (community or maintainer) begins work.
- **Assignment:** Use GitHub's "Assign" feature to claim the issue (prevents duplicate work).
- **Apply:** `status: in-progress`.
- **If work is blocked:** Change status to `status: blocked` and explain the blocker in a comment.

#### 4. **Review-Needed**
- The contributor has opened a pull request and implementation is complete.
- **On the PR:** Add label `status: review-needed`.
- **Link:** Reference the issue in the PR (`Closes #123`).
- **Expectations:** A maintainer will review within response timeframe (see [Response Expectations](#response-expectations)).

#### 5. **Closed**
- The issue is resolved (PR merged, wontfix, duplicate, or external).
- **Remove:** `status: triaged`, `status: in-progress`, `status: review-needed`.
- **Preserve:** `type: *`, `area: *`, `priority: *`, `difficulty: *` for historical reference and searching.
- **If duplicate:** Reference the original issue; add a comment explaining the consolidation.
- **If wontfix:** Add a comment explaining the rationale.

---

## Triage Workflow

### For Maintainers: Triaging a New Issue

1. **Read the issue:** Understand the title, description, steps to reproduce (for bugs), and desired behavior (for features).

2. **Verify:** 
   - For bugs: Can you reproduce it? Is it a real issue or user error?
   - For features: Does it align with the project roadmap? Is it in scope?
   - For docs: Is the documentation actually missing or outdated?

3. **Classify:**
   - Assign `type: *` (bug, feature, documentation, etc.)
   - Assign `area: *` based on affected codebase (may be multiple).
   - Assign `priority: *` based on business impact and urgency.
   - Assign `difficulty: *` based on expected effort to fix.
   - Assign `ecosystem: *` if applicable (soroban, horizon, quickstart).

4. **Comment:** Write a triage summary:
   ```markdown
   **Triage Summary:**
   - **Type:** Bug in wallet connection
   - **Area:** Affected package(s): hooks, wallets
   - **Priority:** High (breaks desktop usage)
   - **Difficulty:** Medium (requires understanding wallet adapter logic)
   - **Next Steps:** Needs investigation of Firefox compatibility with Freighter adapter
   ```

5. **Apply Status:** Add `status: triaged`.

6. **Optional Actions:**
   - If you know who should work on it: mention them with `@username`.
   - If it needs community help: add `status: help-wanted`.
   - If it's perfect for newcomers: add `status: good-first-issue`.

### For Contributors: Working on an Issue

1. **Find an issue:** Look for issues tagged `status: triaged` (ready to work on).
2. **Check assignment:** Ensure no one else is assigned; if needed, comment to claim it.
3. **Self-assign:** Use GitHub's "Assign" button to claim the issue.
4. **Apply `status: in-progress`** to signal active work.
5. **Create a branch:** Follow [CONTRIBUTING.md](../CONTRIBUTING.md) conventions.
6. **Open a PR early:** Link to the issue; this triggers `status: review-needed`.
7. **Address feedback:** Push updates and request re-review.
8. **Merge:** Once approved, your PR will be merged, closing the issue.

---

## Response Expectations

To maintain a healthy contributor experience, the project follows these response timeframes:

| Issue Type | First Response | Action Expected |
|-----------|----------------|-----------------|
| **Bug (p0 critical)** | < 24 hours | Triage started, severity confirmed, assignee identified or help requested |
| **Bug (p1 high)** | < 2 days | Triage started, severity confirmed |
| **Bug (p2 medium)** | < 1 week | Issue reviewed and triaged |
| **Bug (p3 low)** | < 2 weeks | Issue acknowledged |
| **Feature Request (p1+)** | < 1 week | Feasibility discussed, direction indicated |
| **Documentation** | < 2 weeks | Merged or feedback provided |
| **PR Review** | < 3 days | Initial review or feedback |

### Response Format

When responding to an issue:

- **Acknowledge** the issue and thank the reporter.
- **Clarify scope:** Rephrase the problem to show understanding.
- **Explain next steps:** What happens now? What are the blockers?
- **Ask questions** if more information is needed.
- **Link related:** Reference related issues or PRs if applicable.

**Example Response:**

> Thanks for reporting this! I've verified the bug on macOS 14 with Freighter v0.8.2.
>
> **Root cause:** The wallet adapter disconnects when the extension window loses focus.
>
> **Next steps:** 
> - [ ] Investigation: Reproduce on Firefox (currently macOS Chrome only)
> - [ ] Fix: Update disconnect handler to persist connection state
>
> I'm assigning this to @contributor for pickup this week. Please comment if you'd like to work on it!

---

## Setting Up Labels

Labels are created and synchronized using the repository's label automation script.

### Creating/Syncing Labels

The `.github/labels.yml` file defines all labels. To sync them with your GitHub repository:

1. **Install GitHub CLI:**
   ```bash
   # macOS (Homebrew)
   brew install gh
   
   # Windows (Scoop)
   scoop install gh
   
   # Or visit https://cli.github.com/
   ```

2. **Authenticate with GitHub:**
   ```bash
   gh auth login
   ```

3. **Run the sync script:**
   ```bash
   bash scripts/create-labels.sh
   ```

   The script will:
   - Create new labels defined in `.github/labels.yml`
   - Update existing labels to match the definitions
   - Preserve labels not in the config (so custom labels won't be deleted)

### Label Configuration

The `.github/labels.yml` file is YAML-based. Each label entry includes:

```yaml
- name: 'type: bug'          # Label name (must match exactly)
  color: 'd73a4a'            # Hex color code (no #)
  description: 'Something isn't working as expected'  # Used in label UI
```

To add a new label:

1. Add an entry to `.github/labels.yml`
2. Run `bash scripts/create-labels.sh`
3. Update this triage guide if the label changes the workflow

---

## Label Application Examples

### Example 1: Easy Bug (Difficulty: Easy)

**Issue:** "Typo in error message: 'occured' should be 'occurred'"

**Labels:**
- `type: bug` — Corrects incorrect text
- `area: web` — Error message appears in the web UI
- `priority: low (p3)` — Cosmetic issue, no impact on functionality
- `difficulty: easy` — One-line text fix
- `status: triaged` — Ready for pickup

**Triage Comment:**
> Simple typo fix. Perfect for newcomers! Edit the error message string in `src/app/components/ErrorBoundary.tsx` line 42.

---

### Example 2: Medium Feature Request (Difficulty: Medium)

**Issue:** "Add pagination support to the user stream API endpoint"

**Labels:**
- `type: feature` — New capability
- `area: sdk` — Affects SDK client
- `priority: medium (p2)` — Useful enhancement, can wait
- `difficulty: medium` — Requires understanding pagination patterns and API design
- `status: triaged` — Ready for design discussion and implementation

**Triage Comment:**
> Good feature request! We'll want pagination for scalability. Here's the scope:
> 
> **Design Questions:**
> - Limit/offset or cursor-based pagination?
> - Default page size? Max page size?
> 
> **Implementation:**
> - Update query layer to support pagination
> - Modify SDK endpoint to accept `limit`, `offset`, or `cursor`
> - Add tests covering edge cases
> 
> Feel free to comment with thoughts, or wait for us to finalize the design.

---

### Example 3: Hard Bug (Difficulty: Hard)

**Issue:** "Escrow contract fails to release funds with multiple payees"

**Labels:**
- `type: bug` — Defect in contract behavior
- `area: contracts` — Soroban contract code
- `ecosystem: soroban` — Smart contract interaction
- `priority: critical (p0)` — Data loss risk; breaks core feature
- `difficulty: hard` — Requires deep contract logic understanding
- `status: triaged` — Ready for immediate action

**Triage Comment:**
> **🚨 Critical Issue:** Potential data loss. Reproduced in testnet.
>
> **Root Cause:** Contract release logic doesn't iterate payees correctly when checking authorization.
>
> **Scope:**
> - Fix payee iteration in `release()` function
> - Add test case covering multiple payees
> - Deploy patch to testnet for validation
>
> **Blocking:** Release v1.5 (scheduled for Friday)
> 
> Assigning to @maintainer for immediate fix. This needs careful review before merge.

---

## Best Practices

1. **Always apply `type:` first** — It's the primary classifier.
2. **Be specific with `area:`** — An issue in `area: sdk` + `area: core` is clearer than just one.
3. **Discuss ambiguous priority** — If it's unclear whether something is p1 or p2, default to p2 and let the team discuss.
4. **Document blockers** — If an issue is blocked, explain *why* in a comment.
5. **Update labels as context changes** — If new information emerges, adjust priority/difficulty accordingly.
6. **Keep status labels clean** — Remove them when an issue is resolved; use type/area/priority for historical tracking.
7. **Close duplicate issues respectfully** — Link to the primary issue and thank the reporter for the catch.

---

## Related Documentation

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Development workflow, commit conventions, PR process
- [CODEOWNERS](../CODEOWNERS) — Team ownership by area
- [.github/labels.yml](../.github/labels.yml) — Label definitions in YAML format
- [scripts/create-labels.sh](../scripts/create-labels.sh) — Label synchronization automation
