# PowerShell script to regenerate the TypeScript bindings from the locally built WASM.
# This does not deploy anything - it builds the contracts and runs
# `stellar contract bindings typescript` against the resulting WASM.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Resolve-Path (Join-Path $ScriptDir "..")
$ContractsDir = Join-Path $WorkspaceRoot "contracts"
$TargetWasm = "wasm32v1-none"
$ReleaseDir = Join-Path $ContractsDir "target/$TargetWasm/release"
$StellarCli = if ($env:STELLAR_CLI) { $env:STELLAR_CLI } else { "stellar" }

# Contracts whose TypeScript bindings are generated into the SDK package.
$Contracts = @("stream", "splits", "escrow")

if (-not (Get-Command $StellarCli -ErrorAction SilentlyContinue)) {
    Write-Error "The Stellar CLI ('$StellarCli') is required to generate bindings. Install it from https://github.com/stellar/stellar-cli/releases"
    exit 1
}

# 1. Build the contracts (no deploy).
Write-Host "Building smart contracts in Rust workspace..."
cargo build --manifest-path (Join-Path $ContractsDir "Cargo.toml") --target $TargetWasm --release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 2. Generate TypeScript bindings for each contract from its WASM.
foreach ($Contract in $Contracts) {
    $WasmPath = Join-Path $ReleaseDir "$Contract.wasm"
    if (-not (Test-Path $WasmPath)) {
        Write-Error "WASM file not found for $Contract at $WasmPath."
        exit 1
    }

    $OutputDir = Join-Path $WorkspaceRoot "packages/contracts/src/generated/$Contract"
    Write-Host "Generating TypeScript bindings for $Contract -> $OutputDir"
    & $StellarCli contract bindings typescript --wasm $WasmPath --output-dir $OutputDir --overwrite
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Bindings regenerated. Review the diff under packages/contracts/src/generated."
