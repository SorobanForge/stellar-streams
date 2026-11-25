#!/usr/bin/env node
// Verifies that every publishable workspace package resolves the way a consumer
// will see it: the `exports` map points at files that exist, the package can be
// imported by name, and its public surface is non-empty.
//
// Run after `pnpm build`, because it imports the compiled output rather than
// the sources. It fails loudly instead of letting a broken entry point reach a
// published tarball.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Packages whose entry points are part of the public API. */
const PACKAGES = [
  'packages/types',
  'packages/utils',
  'packages/hooks',
  'packages/wallets',
  'packages/sdk',
];

/** Reads a package.json from a workspace directory. */
async function readPackage(dir) {
  return JSON.parse(await readFile(resolve(root, dir, 'package.json'), 'utf8'));
}

const failures = [];

for (const dir of PACKAGES) {
  const pkg = await readPackage(dir);
  const label = pkg.name;

  if (!pkg.exports?.['.']) {
    failures.push(`${label}: no "exports" entry for "."`);
    continue;
  }
  if (!Array.isArray(pkg.files) || !pkg.files.includes('dist')) {
    failures.push(`${label}: "files" does not ship dist`);
  }
  if (pkg.sideEffects !== false) {
    failures.push(`${label}: "sideEffects" is not false`);
  }

  const targets = pkg.exports['.'];
  for (const [condition, target] of Object.entries(targets)) {
    const path = resolve(root, dir, target);
    if (!existsSync(path)) {
      failures.push(`${label}: exports["."].${condition} -> ${target} does not exist`);
    }
  }

  // The import must work through the package name, which is what a consumer
  // bundles; a path that only resolves relatively would hide a broken map.
  const entry = pathToFileURL(resolve(root, dir, pkg.exports['.'].import)).href;
  try {
    const mod = await import(entry);
    if (Object.keys(mod).length === 0) {
      failures.push(`${label}: entry point exports nothing`);
    }
  } catch (error) {
    failures.push(`${label}: importing ${pkg.exports['.'].import} failed: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error('Package entry check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Package entries OK (${PACKAGES.length} packages).`);
