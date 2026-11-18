#!/usr/bin/env node
// Create the curated contributor backlog on GitHub, one issue per entry in
// scripts/contributor-issues/.
//
// The script is idempotent: a title that already exists in any state is skipped,
// so it can be re-run after adding new entries without opening duplicates.
//
// Usage:
//   node scripts/create-contributor-issues.mjs            # create missing issues
//   node scripts/create-contributor-issues.mjs --dry-run  # print the plan only
//
// Requires the GitHub CLI, authenticated: `gh auth login`. Set GITHUB_REPOSITORY
// to target a fork; otherwise the repository of the current checkout is used.

import { execFileSync } from 'node:child_process';
import { CONTRIBUTOR_ISSUES } from './contributor-issues/index.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const DELAY_MS = 250;

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function attempt(args, input) {
  try {
    return { ok: true, output: gh(args, input) };
  } catch (error) {
    const stderr = error.stderr?.toString().trim() || error.message;
    return { ok: false, error: stderr };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!attempt(['auth', 'status']).ok) {
  console.error('Error: not authenticated with the GitHub CLI. Run `gh auth login` first.');
  process.exit(1);
}

const repository =
  process.env.GITHUB_REPOSITORY ||
  attempt(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).output?.trim();

if (!repository) {
  console.error('Error: could not determine the repository. Set GITHUB_REPOSITORY=owner/name.');
  process.exit(1);
}

// Fail fast on a label typo instead of 100 partially-labelled issues.
const labelResult = attempt([
  'label',
  'list',
  '--repo',
  repository,
  '--limit',
  '200',
  '--json',
  'name',
]);
if (!labelResult.ok) {
  console.error(`Error: could not list labels for ${repository}: ${labelResult.error}`);
  process.exit(1);
}
const knownLabels = new Set(JSON.parse(labelResult.output).map((label) => label.name));
const unknownLabels = new Set();
for (const issue of CONTRIBUTOR_ISSUES) {
  for (const label of issue.labels) {
    if (!knownLabels.has(label)) unknownLabels.add(label);
  }
}
if (unknownLabels.size > 0) {
  console.error(
    `Error: labels missing from ${repository}: ${[...unknownLabels].join(', ')}. ` +
      'Add them from .github/labels.yml (see docs/triage.md) and re-run.',
  );
  process.exit(1);
}

const existingResult = attempt([
  'issue',
  'list',
  '--repo',
  repository,
  '--state',
  'all',
  '--limit',
  '1000',
  '--json',
  'title,number',
]);
if (!existingResult.ok) {
  console.error(`Error: could not list existing issues: ${existingResult.error}`);
  process.exit(1);
}
const existing = JSON.parse(existingResult.output);
const existingTitles = new Set(existing.map((entry) => entry.title.trim().toLowerCase()));
const nextNumber = existing.reduce((max, entry) => Math.max(max, entry.number), 0) + 1;

const pending = CONTRIBUTOR_ISSUES.filter(
  (issue) => !existingTitles.has(issue.title.trim().toLowerCase()),
);
const alreadyThere = CONTRIBUTOR_ISSUES.length - pending.length;

console.log(
  `${CONTRIBUTOR_ISSUES.length} curated issues; ${alreadyThere} already exist, ` +
    `${pending.length} to create in ${repository}${DRY_RUN ? ' (dry run)' : ''}.`,
);

if (DRY_RUN) {
  let number = nextNumber;
  for (const issue of pending) {
    console.log(`  #${number}  ${issue.title}\n        labels: ${issue.labels.join(', ')}`);
    number += 1;
  }
  process.exit(0);
}

const created = [];
const failed = [];

for (const [index, issue] of pending.entries()) {
  const args = [
    'issue',
    'create',
    '--repo',
    repository,
    '--title',
    issue.title,
    '--body-file',
    '-',
  ];
  for (const label of issue.labels) args.push('--label', label);

  const result = attempt(args, issue.body);
  if (!result.ok) {
    failed.push({ issue, error: result.error });
    console.error(`[${index + 1}/${pending.length}] FAILED ${issue.title}\n  ${result.error}`);
  } else {
    const url = result.output.trim().split('\n').pop() ?? '';
    created.push({ issue, url });
    console.log(`[${index + 1}/${pending.length}] created ${issue.title} -> ${url}`);
  }

  // Stay well inside GitHub's secondary rate limits.
  await sleep(DELAY_MS);
}

console.log(
  `\nDone: ${created.length} created, ${alreadyThere} already present, ${failed.length} failed.`,
);
if (failed.length > 0) {
  console.error('Failed titles:');
  for (const entry of failed) console.error(`  - ${entry.issue.title}: ${entry.error}`);
  process.exit(1);
}
