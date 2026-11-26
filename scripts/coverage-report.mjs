#!/usr/bin/env node
/**
 * Runs `vitest --coverage` for every workspace package that has tests and builds
 * a per-package coverage summary for pull requests.
 *
 * Output:
 *   * coverage/coverage-summary.json — merged per-package totals (build artifact).
 *   * coverage/coverage-report.md    — the markdown table posted on pull requests
 *                                     and appended to the Actions step summary.
 *
 * Workspace packages without a test file are listed as "not covered" instead of
 * being reported as 0%, so adding the first test to a package never looks like a
 * regression. Deltas are measured against `scripts/coverage-baseline.json`, the
 * numbers recorded when coverage reporting was introduced (issue #162).
 *
 * Usage:
 *   node scripts/coverage-report.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = join(ROOT, 'coverage');
const BASELINE_PATH = join(ROOT, 'scripts', 'coverage-baseline.json');

// Low enough to pass today; raise them as suites grow instead of letting a
// regression land unnoticed. Aggregate across every covered package.
const THRESHOLDS = {
  statements: 85,
  branches: 80,
  functions: 85,
  lines: 87,
};

const METRICS = ['statements', 'branches', 'functions', 'lines'];

/** Every `packages/*` and `apps/*` directory that belongs to the workspace. */
function workspaceDirs() {
  const dirs = [];
  for (const group of ['packages', 'apps']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      dirs.push({ group, dir: join(group, name.name), full: join(base, name.name) });
    }
  }
  return dirs;
}

function hasTests(dir) {
  const src = join(dir, 'src');
  if (!existsSync(src)) return false;
  const stack = [src];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.test\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) return true;
    }
  }
  return false;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function runCoverage(pkgDir) {
  const name = readJson(join(pkgDir.full, 'package.json'))?.name;
  if (!name) return { ok: false, reason: 'no package name' };

  try {
    // The summary reporter is requested explicitly: a package config can list it,
    // but only the CLI flag reliably emits coverage-summary.json under Vitest 4.
    execFileSync(
      'pnpm',
      ['--filter', name, 'exec', 'vitest', 'run', '--coverage', '--coverage.reporter=json-summary'],
      {
        cwd: ROOT,
        stdio: 'inherit',
      },
    );
  } catch {
    // A failing suite is still useful to report on; CI already fails the job.
    process.exitCode = 1;
  }

  return { ok: true, name };
}

function pct(value) {
  return typeof value === 'number' ? value : null;
}

function formatPct(value) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function formatDelta(value) {
  if (value === null) return '—';
  if (Math.abs(value) < 0.005) return '±0.00';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const baseline = readJson(BASELINE_PATH)?.packages ?? {};
  const covered = [];
  const notCovered = [];

  for (const pkgDir of workspaceDirs()) {
    const manifest = readJson(join(pkgDir.full, 'package.json'));
    if (!manifest?.name) continue;
    const label = pkgDir.dir.replace(/^(packages|apps)\//, '');

    if (!hasTests(pkgDir.full)) {
      notCovered.push(label);
      continue;
    }

    const result = runCoverage(pkgDir);
    const summaryPath = join(pkgDir.full, 'coverage', 'coverage-summary.json');
    const summary = readJson(summaryPath);

    if (!result.ok || !summary?.total) {
      notCovered.push(label);
      continue;
    }

    const totals = Object.fromEntries(
      METRICS.map((metric) => [metric, summary.total[metric]?.pct]),
    );
    covered.push({
      package: label,
      name: manifest.name,
      totals,
      baseline: baseline[label] ?? null,
    });
  }

  if (covered.length === 0) {
    console.error('No package produced coverage output.');
    process.exitCode = 1;
  }

  const merged = {
    generatedBy: 'scripts/coverage-report.mjs',
    thresholds: THRESHOLDS,
    packages: Object.fromEntries(covered.map(({ package: label, totals }) => [label, totals])),
    notCovered,
  };
  writeFileSync(join(OUTPUT_DIR, 'coverage-summary.json'), `${JSON.stringify(merged, null, 2)}\n`);

  const rows = covered.map(({ package: label, totals, baseline: previous }) => {
    const cells = METRICS.map((metric) => formatPct(pct(totals[metric])));
    const deltas = METRICS.map((metric) => {
      const now = pct(totals[metric]);
      const before = pct(previous?.[metric]);
      return formatDelta(now !== null && before !== null ? now - before : null);
    });
    return `| \`${label}\` | ${cells.join(' | ')} | ${deltas.join(' | ')} |`;
  });

  const totals = Object.fromEntries(
    METRICS.map((metric) => {
      const values = covered.map(({ totals: t }) => pct(t[metric])).filter((v) => v !== null);
      return [metric, values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null];
    }),
  );

  const failed = METRICS.filter((metric) => {
    const value = totals[metric];
    return value !== null && value < THRESHOLDS[metric];
  });

  const lines = [
    '## Test coverage',
    '',
    `| Package | Statements | Branches | Functions | Lines | Δ statements | Δ branches | Δ functions | Δ lines |`,
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    `| **average** | ${METRICS.map((m) => formatPct(totals[m])).join(' | ')} | ${METRICS.map(() => '—').join(' | ')} |`,
    '',
    `Thresholds: ${METRICS.map((m) => `${m} ≥ ${THRESHOLDS[m]}%`).join(', ')} (average across covered packages).`,
    failed.length > 0
      ? `❌ Below threshold: ${failed.map((m) => `${m} (${formatPct(totals[m])})`).join(', ')}`
      : '✅ All thresholds met.',
    '',
    `Not covered (no tests yet): ${notCovered.length > 0 ? notCovered.map((p) => `\`${p}\``).join(', ') : 'none'}.`,
    '',
    '<sub>Deltas compare against `scripts/coverage-baseline.json`. Report generated by `scripts/coverage-report.mjs`.</sub>',
  ];

  const markdown = `${lines.join('\n')}\n`;
  writeFileSync(join(OUTPUT_DIR, 'coverage-report.md'), markdown);
  process.stdout.write(`\n${markdown}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: 'a' });
  }

  if (failed.length > 0) {
    console.error(`Coverage below threshold: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
