#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/.."
CONTRACTS_DIR="$WORKSPACE_ROOT/contracts"
TARGET_WASM="wasm32v1-none"
RELEASE_DIR="$CONTRACTS_DIR/target/$TARGET_WASM/release"
STELLAR_CLI="${STELLAR_CLI:-stellar}"

# Contracts whose TypeScript bindings are generated into the SDK package.
CONTRACTS=("stream" "splits" "escrow")

if ! command -v "$STELLAR_CLI" >/dev/null 2>&1; then
    echo "Error: the Stellar CLI ('$STELLAR_CLI') is required to generate bindings." >&2
    echo "Install it from https://github.com/stellar/stellar-cli/releases" >&2
    exit 1
fi

# 1. Build the contracts. This needs no network access to Stellar and does not
#    deploy anything - it only produces the WASM the bindings are generated from.
echo "Building smart contracts in Rust workspace..."
cargo build --manifest-path "$CONTRACTS_DIR/Cargo.toml" --target "$TARGET_WASM" --release

# 2. Generate TypeScript bindings for each contract from its WASM.
for Contract in "${CONTRACTS[@]}"; do
    WasmPath="$RELEASE_DIR/$Contract.wasm"
    if [ ! -f "$WasmPath" ]; then
        echo "Error: WASM file not found for $Contract at $WasmPath." >&2
        exit 1
    fi

    OutputDir="$WORKSPACE_ROOT/packages/contracts/src/generated/$Contract"
    echo "Generating TypeScript bindings for $Contract -> $OutputDir"
    "$STELLAR_CLI" contract bindings typescript \
        --wasm "$WasmPath" \
        --output-dir "$OutputDir" \
        --overwrite
done

echo "Bindings regenerated. Review the diff under packages/contracts/src/generated."
