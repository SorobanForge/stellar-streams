#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/.."
RELEASE_DIR="$WORKSPACE_ROOT/contracts/target/wasm32v1-none/release"
BUDGETS_FILE="$WORKSPACE_ROOT/contracts/wasm-size-budgets.json"

REPORT_ONLY=false
if [ "${1:-}" = "--report-only" ]; then
    REPORT_ONLY=true
fi

if [ ! -f "$BUDGETS_FILE" ]; then
    echo "Error: size budget file not found at $BUDGETS_FILE"
    exit 1
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required to read $BUDGETS_FILE"
    exit 1
fi

# The budget file is the single list of contracts to check.
CONTRACTS=$(node -e "
const { contracts } = require('$BUDGETS_FILE');
process.stdout.write(Object.keys(contracts).join(' '));
")

echo "Optimized WASM size budget"
echo "| Contract | Size (bytes) | Budget (bytes) | Status |"
echo "| :------- | -----------: | -------------: | :----- |"

failed=0
summary="## Contract WASM sizes\n\n| Contract | Size (bytes) | Budget (bytes) | Status |\n| :------- | -----------: | -------------: | :----- |\n"

for Contract in $CONTRACTS; do
    Wasm="$RELEASE_DIR/$Contract.optimized.wasm"
    Budget=$(node -e "
const { contracts } = require('$BUDGETS_FILE');
const budget = contracts['$Contract'];
if (!budget || !Number.isInteger(budget.maxBytes)) {
  console.error('Missing maxBytes for $Contract');
  process.exit(1);
}
process.stdout.write(String(budget.maxBytes));
")

    if [ ! -f "$Wasm" ]; then
        echo "| $Contract | missing | $Budget | FAIL |"
        if [ "$REPORT_ONLY" = false ]; then
            echo "::error title=Missing optimized WASM::Expected $Contract.optimized.wasm under $RELEASE_DIR. Build the contracts before checking sizes."
        fi
        failed=1
        summary="$summary| $Contract | missing | $Budget | FAIL |\n"
        continue
    fi

    Size=$(wc -c < "$Wasm" | tr -d ' ')
    Status="ok"
    if [ "$Size" -gt "$Budget" ]; then
        Status="FAIL"
        failed=1
        Over=$((Size - Budget))
        if [ "$REPORT_ONLY" = false ]; then
            echo "::error title=$Contract WASM over budget::$Contract optimized WASM is $Size bytes, $Over bytes over the $Budget-byte budget. Reduce the contract or justify a budget change in this PR."
        fi
    fi

    echo "| $Contract | $Size | $Budget | $Status |"
    summary="$summary| $Contract | $Size | $Budget | $Status |\n"
done

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf "%b" "$summary" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "$failed" -ne 0 ]; then
    if [ "$REPORT_ONLY" = true ]; then
        echo "One or more contracts exceed the size budget."
    else
        echo "Error: one or more contracts exceed the size budget."
        exit 1
    fi
else
    echo "All contract sizes are within budget."
fi
