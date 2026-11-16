#!/usr/bin/env bash
set -euo pipefail

VERSION="27.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
BIN_DIR="$SCRIPT_DIR/../bin"
mkdir -p "$BIN_DIR"

if command -v stellar >/dev/null 2>&1; then
    echo "Stellar CLI is already available on PATH."
    exit 0
fi

if [ -f "$BIN_DIR/stellar" ]; then
    echo "Stellar CLI is already present in bin/stellar"
    exit 0
fi

TAR_PATH="$BIN_DIR/stellar-cli.tar.gz"
URL="https://github.com/stellar/stellar-cli/releases/download/v${VERSION}/stellar-cli-${VERSION}-x86_64-unknown-linux-gnu.tar.gz"

echo "Downloading Stellar CLI v$VERSION from $URL..."
curl -sSL "$URL" -o "$TAR_PATH"

echo "Extracting archive..."
tar -zxf "$TAR_PATH" -C "$BIN_DIR"
rm -f "$TAR_PATH"

EXTRACTED_DIR="$BIN_DIR/stellar-cli-${VERSION}-x86_64-unknown-linux-gnu"
if [ -d "$EXTRACTED_DIR" ]; then
    mv "$EXTRACTED_DIR/stellar" "$BIN_DIR/stellar"
    rm -rf "$EXTRACTED_DIR"
fi

chmod +x "$BIN_DIR/stellar"

if [ -f "$BIN_DIR/stellar" ]; then
    echo "Stellar CLI installed successfully at: $BIN_DIR/stellar"
else
    echo "Error: stellar binary was not found after extraction." >&2
    exit 1
fi
