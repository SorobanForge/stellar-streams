// The problem statement, the acceptance criteria and the stack for every issue
// live in the sibling modules, grouped by the part of the repository they touch.
//
// Keep titles in commit-message style (`type(scope): ...`) and label sets inside
// the taxonomy in .github/labels.yml.
import { CONTRACT_ISSUES } from './contracts.mjs';
import { SDK_ISSUES } from './sdk.mjs';
import { FRONTEND_ISSUES } from './frontend.mjs';
import { PACKAGE_ISSUES } from './packages.mjs';
import { PLATFORM_ISSUES } from './platform.mjs';

export const CONTRIBUTOR_ISSUES = [
  ...CONTRACT_ISSUES,
  ...SDK_ISSUES,
  ...FRONTEND_ISSUES,
  ...PACKAGE_ISSUES,
  ...PLATFORM_ISSUES,
];

/** Titles must be unique so re-running the creator never opens a duplicate. */
const seen = new Set();
for (const issue of CONTRIBUTOR_ISSUES) {
  if (seen.has(issue.title)) {
    throw new Error(`Duplicate issue title: ${issue.title}`);
  }
  seen.add(issue.title);
  if (!issue.body.trim()) {
    throw new Error(`Issue has an empty body: ${issue.title}`);
  }
  if (new Set(issue.labels).size !== issue.labels.length) {
    throw new Error(`Issue has a duplicate label: ${issue.title}`);
  }
}
