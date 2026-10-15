# Contributing to Stellar Streams

Thank you for your interest in contributing to **Stellar Streams**! We welcome contributions from everyone.

This project is a monorepo containing multiple packages and applications, managed with `pnpm` and `Turborepo`.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Issue Triage & Labels

Before opening a new issue or working on existing ones, please review our [Triage & Labeling Guide](docs/triage.md). It explains:

- **Label taxonomy:** How we classify issues by type, area, priority, difficulty, and status
- **Issue lifecycle:** The workflow from triage → assignment → in-progress → review → closed
- **Response expectations:** Expected timelines for triage and review feedback
- **Setting up labels:** How to synchronize labels using `scripts/create-labels.sh`

This guide helps us organize work consistently and ensures smooth collaboration.

## Getting Started

### Prerequisites

To contribute to this project, you will need:

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0
- **Git**

### Installation

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/stellar-starter-kit.git
   cd stellar-starter-kit
   ```
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Initialize Husky hooks:
   ```bash
   pnpm run prepare
   ```

---

## Development Workflow

### Branching Model

Always create a new feature branch for your changes:

```bash
git checkout -b feat/my-new-feature
# or
git checkout -b fix/my-bugfix
```

### Formatting and Linting

We enforce strict formatting and linting rules using **ESLint** and **Prettier**. You can run these checks locally:

- Run linter: `pnpm run lint`
- Check formatting: `pnpm run format:check`
- Fix formatting: `pnpm run format:write`

### Git Commit Conventions

We follow the **Conventional Commits** specification. Commits must be structured as follows:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Common types include:

- `feat`: A new feature for the user, not a new feature for build script
- `fix`: A bug fix for the user, not a fix to a build script
- `docs`: Changes to the documentation
- `style`: Formatting, missing semi colons, etc; no production code change
- `refactor`: Refactoring production code, e.g. renaming a variable
- `test`: Adding missing tests, refactoring tests; no production code change
- `chore`: Updating grunt tasks etc; no production code change

Example:

```bash
git commit -m "feat(sdk): add Stellar wallet connection hook"
```

---

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/my-new-feature
   ```
2. Open a Pull Request on GitHub against the `main` branch.
3. Fill out the PR template completely.
4. Ensure all CI checks (linting, testing, and building) pass successfully.
5. Address any review feedback. Once approved, your PR will be merged!
