#!/usr/bin/env node
'use strict';

/**
 * Preinstall guard: this monorepo is managed with pnpm only.
 *
 * Running `npm install` or `yarn install` here produces a dependency tree that
 * CI never sees and a stray lockfile (package-lock.json / yarn.lock) that
 * conflicts with the workspace: protocol. Fail fast with a clear message and
 * let the contributor install with pnpm instead.
 *
 * See CONTRIBUTING.md for the supported toolchain.
 */
const userAgent = process.env.npm_config_user_agent || '';
const manager = userAgent.split('/')[0].trim();

if (userAgent && manager !== 'pnpm') {
  console.error(
    `\nThis project uses pnpm, not "${manager}".\n\n` +
      'Install pnpm (https://pnpm.io/installation) and run:\n\n' +
      '  pnpm install\n\n' +
      'See CONTRIBUTING.md for details.\n',
  );
  process.exit(1);
}
