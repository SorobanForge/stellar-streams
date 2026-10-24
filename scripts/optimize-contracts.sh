#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/.."
RELEASE_DIR="$WORKSPACE_ROOT/contracts/target/wasm32v1-none/release"

# Use bin/stellar or fallback to global stellar CLI
STELLAR_CLI="stellar"

echo "Optimizing WASM contracts using Stellar CLI..."

if [ ! -d "$RELEASE_DIR" ]; then
    echo "Error: Release directory not found. Please build contracts first."
    exit 1
fi

Contracts=("stream" "splits" "escrow")

# Collect sizes for reporting
declare -A sizes_before
declare -A sizes_after

for Contract in "${Contracts[@]}"; do
    InputWasm="$RELEASE_DIR/$Contract.wasm"
    
    if [ ! -f "$InputWasm" ]; then
        echo "Warning: Could not find WASM for $Contract at $InputWasm"
        continue
    fi
    
    # Capture size before optimization
    sizes_before["$Contract"]=$(stat -f%z "$InputWasm" 2>/dev/null || stat -c%s "$InputWasm" 2>/dev/null || echo "unknown")
    
    echo "Optimizing $Contract.wasm..."
    $STELLAR_CLI contract optimize --wasm "$InputWasm"
    
    # Capture size after optimization
    sizes_after["$Contract"]=$(stat -f%z "$InputWasm" 2>/dev/null || stat -c%s "$InputWasm" 2>/dev/null || echo "unknown")
done

# Print optimization summary
echo ""
echo "========================================="
echo "WASM Optimization Summary"
echo "========================================="
for Contract in "${Contracts[@]}"; do
    if [ -f "$RELEASE_DIR/$Contract.wasm" ]; then
        before="${sizes_before[$Contract]:-unknown}"
        after="${sizes_after[$Contract]:-unknown}"
        
        if [ "$before" != "unknown" ] && [ "$after" != "unknown" ]; then
            reduction=$(( (before - after) * 100 / before ))
            printf "%-12s before: %8s bytes  after: %8s bytes  reduction: %3d%%\n" \
                "$Contract" "$before" "$after" "$reduction"
        else
            printf "%-12s before: %8s bytes  after: %8s bytes\n" \
                "$Contract" "$before" "$after"
        fi
    fi
done
echo "========================================="
echo "Optimizations complete!"
