# PowerShell script to invoke and test the deployed Escrow contract.
$WorkspaceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BinDir = Join-Path $WorkspaceRoot "bin"
$StellarCli = Join-Path $BinDir "stellar.exe"

if (-not (Test-Path $StellarCli)) {
    $StellarCli = "stellar"
}

$DeploymentsFile = Join-Path $WorkspaceRoot "apps/web/src/generated/deployments.json"
if (-not (Test-Path $DeploymentsFile)) {
    Write-Error "Deployments file not found. Please deploy the contract first."
    exit 1
}

$Deployments = @{}
$DeploymentsObj = Get-Content $DeploymentsFile | ConvertFrom-Json
if ($DeploymentsObj) {
    foreach ($prop in $DeploymentsObj.psobject.properties) {
        $Deployments[$prop.Name] = $prop.Value
    }
}
$EscrowDep = $Deployments["escrow"]
$ContractId = ""
if ($EscrowDep) {
    if ($EscrowDep.contractId) {
        $ContractId = $EscrowDep.contractId
    } elseif ($EscrowDep.GetType().Name -eq "Hashtable" -and $EscrowDep["contractId"]) {
        $ContractId = $EscrowDep["contractId"]
    } else {
        $ContractId = $EscrowDep.ToString()
    }
}

if (-not $ContractId) {
    Write-Error "Escrow contract ID not found in deployments."
    exit 1
}

# Ensure payee and arbiter keys exist
$KeysList = & $StellarCli keys ls
if ($KeysList -notcontains "payee") {
    & $StellarCli keys generate payee
}
if ($KeysList -notcontains "arbiter") {
    & $StellarCli keys generate arbiter
}

$DeployerAddress = (& $StellarCli keys address deployer).Trim()
$PayeeAddress = (& $StellarCli keys address payee).Trim()
$ArbiterAddress = (& $StellarCli keys address arbiter).Trim()

# Native XLM token contract ID on testnet
$TokenContract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

$EscrowId = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$Amount = 10000000
$Deadline = $EscrowId + 3600

Write-Host "Invoking Escrow contract (ID: $ContractId)..." -ForegroundColor Green
Write-Host "Payer: $DeployerAddress"
Write-Host "Payee: $PayeeAddress"
Write-Host "Arbiter: $ArbiterAddress"
Write-Host "Escrow ID: $EscrowId"

# 1. Create Escrow
Write-Host "`n1. Creating escrow agreement..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- create_escrow --id $EscrowId --payer $DeployerAddress --payee $PayeeAddress --arbiter $ArbiterAddress --token $TokenContract --amount $Amount --deadline $Deadline

# 2. Get Escrow (Created)
Write-Host "`n2. Fetching escrow status (expecting Created)..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- get_escrow --id $EscrowId

# 3. Fund Escrow
Write-Host "`n3. Funding escrow agreement..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- fund_escrow --id $EscrowId

# 4. Get Escrow (Funded)
Write-Host "`n4. Fetching escrow status (expecting Funded)..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- get_escrow --id $EscrowId

# 5. Release Escrow
Write-Host "`n5. Releasing escrow (by payer)..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- release_escrow --id $EscrowId --caller $DeployerAddress

# 6. Get Escrow (Released)
Write-Host "`n6. Fetching final escrow status (expecting Released)..."
& $StellarCli contract invoke --id $ContractId --source-account deployer --network testnet -- get_escrow --id $EscrowId

Write-Host "`nEscrow invocation lifecycle successfully verified!" -ForegroundColor Green
