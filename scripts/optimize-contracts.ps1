# PowerShell script to optimize compiled WASM contracts.
$WorkspaceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BinDir = Join-Path $WorkspaceRoot "bin"
$StellarCli = Join-Path $BinDir "stellar.exe"

if (-not (Test-Path $StellarCli)) {
    $StellarCli = "stellar"
}

Write-Host "Optimizing WASM contracts using Stellar CLI..."

$ReleaseDir = Join-Path $WorkspaceRoot "contracts\target\wasm32v1-none\release"
if (-not (Test-Path $ReleaseDir)) {
    Write-Error "Release directory not found. Please build contracts first."
    exit 1
}

# Add more contracts to this array as we implement them
$Contracts = @("stream", "splits", "escrow")

# Hash tables to store sizes before and after
$SizesBefore = @{}
$SizesAfter = @{}

foreach ($Contract in $Contracts) {
    $WasmName = "$Contract.wasm"
    $InputWasm = Join-Path $ReleaseDir $WasmName

    if (-not (Test-Path $InputWasm)) {
        Write-Warning "Could not find WASM for $Contract at $InputWasm"
        continue
    }

    # Capture size before optimization
    $SizesBefore[$Contract] = (Get-Item $InputWasm).Length

    Write-Host "Optimizing $WasmName ..."
    & $StellarCli contract optimize --wasm $InputWasm
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to optimize $Contract."
        exit 1
    }

    # Capture size after optimization
    $SizesAfter[$Contract] = (Get-Item $InputWasm).Length
}

# Print optimization summary
Write-Host ""
Write-Host "========================================="
Write-Host "WASM Optimization Summary"
Write-Host "========================================="

foreach ($Contract in $Contracts) {
    $InputWasm = Join-Path $ReleaseDir "$Contract.wasm"
    if (Test-Path $InputWasm) {
        $Before = $SizesBefore[$Contract]
        $After = $SizesAfter[$Contract]
        
        if ($Before -and $After) {
            $Reduction = [math]::Round(($Before - $After) * 100 / $Before)
            Write-Host ("{0,-12} before: {1,8} bytes  after: {2,8} bytes  reduction: {3,3}%" -f $Contract, $Before, $After, $Reduction)
        } else {
            Write-Host ("{0,-12} before: {1,8} bytes  after: {2,8} bytes" -f $Contract, $Before, $After)
        }
    }
}
Write-Host "========================================="
Write-Host "Optimizations complete!"
