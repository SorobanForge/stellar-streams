#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/.."
RELEASE_DIR="$WORKSPACE_ROOT/contracts/target/wasm32v1-none/release"

# Use bin/stellar or fallback to global stellar CLI
STELLAR_CLI="stellar"

# `--check` turns the size report into a gate (used by CI); without it the
# command only reports sizes so local builds stay informative.
CHECK=false
if [ "${1:-}" = "--check" ]; then
    CHECK=true
fi

echo "Optimizing WASM contracts using Stellar CLI..."

if [ ! -d "$RELEASE_DIR" ]; then
    echo "Error: Release directory not found. Please build contracts first."
    exit 1
fi

Contracts=("stream" "splits" "escrow")

for Contract in "${Contracts[@]}"; do
    InputWasm="$RELEASE_DIR/$Contract.wasm"
    
    if [ ! -f "$InputWasm" ]; then
        echo "Warning: Could not find WASM for $Contract at $InputWasm"
        continue
    fi
    
    echo "Optimizing $Contract.wasm..."
    $STELLAR_CLI contract optimize --wasm "$InputWasm"
done

echo "Optimizations complete!"

if [ "$CHECK" = true ]; then
    bash "$SCRIPT_DIR/check-contract-sizes.sh"
else
    bash "$SCRIPT_DIR/check-contract-sizes.sh" --report-only
fi
