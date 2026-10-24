#!/usr/bin/env bash
# Configure branch protection for `main` to match the repo's actual CI job names.
#
# Required status check contexts are the *job names* in .github/workflows/ci.yml
# and .github/workflows/pr-check.yml — keep them in sync if those change.
#
# Usage:
#   ./scripts/setup-branch-protection.sh
#
# Requires the GitHub CLI, authenticated with admin rights on the repo.

set -euo pipefail

if ! command -v gh &>/dev/null; then
    echo "Error: the GitHub CLI ('gh') is not installed. See https://cli.github.com/."
    exit 1
fi

if ! gh auth status &>/dev/null; then
    echo "Error: not authenticated with GitHub CLI. Run 'gh auth login' first."
    exit 1
fi

REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
BRANCH="${1:-main}"

echo "Configuring branch protection for $REPO@$BRANCH..."

gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/$REPO/branches/$BRANCH/protection" \
    --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint Codebase",
      "Run TypeScript Checks",
      "Run Unit Tests",
      "Test Soroban Contracts",
      "Verify Production Build",
      "Review Dependencies"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Branch protection configured."
