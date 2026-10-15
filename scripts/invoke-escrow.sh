#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
WORKSPACE_ROOT="$SCRIPT_DIR/.."
STELLAR_CLI="stellar"

DEPLOYMENTS_FILE="$WORKSPACE_ROOT/apps/web/src/generated/deployments.json"

if [ ! -f "$DEPLOYMENTS_FILE" ]; then
    echo "Error: Deployments file not found. Please deploy the contract first."
    exit 1
fi

# Extract escrow ID using jq or python
if command -v jq &>/dev/null; then
    CONTRACT_ID=$(jq -r '.escrow.contractId // .escrow' "$DEPLOYMENTS_FILE")
else
    CONTRACT_ID=$(python3 -c "
import json
data = json.load(open('$DEPLOYMENTS_FILE'))['escrow']
print(data['contractId'] if isinstance(data, dict) else data)
")
fi

if [ -z "$CONTRACT_ID" ] || [ "$CONTRACT_ID" == "null" ]; then
    echo "Error: Escrow contract ID not found in deployments."
    exit 1
fi

echo "Invoking Escrow contract (ID: $CONTRACT_ID)..."

# Ensure payee and arbiter keys exist
if ! $STELLAR_CLI keys ls | grep -q "payee"; then
    echo "Generating payee key pair..."
    $STELLAR_CLI keys generate payee
fi

if ! $STELLAR_CLI keys ls | grep -q "arbiter"; then
    echo "Generating arbiter key pair..."
    $STELLAR_CLI keys generate arbiter
fi

DEPLOYER_ADDRESS=$($STELLAR_CLI keys address deployer | tr -d '\r' | xargs)
PAYEE_ADDRESS=$($STELLAR_CLI keys address payee | tr -d '\r' | xargs)
ARBITER_ADDRESS=$($STELLAR_CLI keys address arbiter | tr -d '\r' | xargs)

# Native XLM token contract ID on testnet
TOKEN_CONTRACT="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

# Generate a unique escrow ID based on current timestamp
ESCROW_ID=$(date +%s)
AMOUNT=10000000 # 1 XLM (in stroops)
DEADLINE=$(($(date +%s) + 3600)) # 1 hour from now

echo "Payer (Deployer): $DEPLOYER_ADDRESS"
echo "Payee:            $PAYEE_ADDRESS"
echo "Arbiter:          $ARBITER_ADDRESS"
echo "Escrow ID:        $ESCROW_ID"

# 1. Create Escrow
echo ""
echo "1. Creating escrow agreement..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- create_escrow --id "$ESCROW_ID" --payer "$DEPLOYER_ADDRESS" --payee "$PAYEE_ADDRESS" --arbiter "$ARBITER_ADDRESS" --token "$TOKEN_CONTRACT" --amount "$AMOUNT" --deadline "$DEADLINE"

# 2. Get Escrow (Created Status)
echo ""
echo "2. Fetching escrow status (expecting status: Created)..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- get_escrow --id "$ESCROW_ID"

# 3. Fund Escrow
echo ""
echo "3. Funding escrow agreement..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- fund_escrow --id "$ESCROW_ID"

# 4. Get Escrow (Funded Status)
echo ""
echo "4. Fetching escrow status (expecting status: Funded)..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- get_escrow --id "$ESCROW_ID"

# 5. Release Escrow
echo ""
echo "5. Releasing escrow agreement (by payer)..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- release_escrow --id "$ESCROW_ID" --caller "$DEPLOYER_ADDRESS"

# 6. Get Escrow (Released Status)
echo ""
echo "6. Fetching final escrow status (expecting status: Released)..."
$STELLAR_CLI contract invoke --id "$CONTRACT_ID" --source-account deployer --network testnet -- get_escrow --id "$ESCROW_ID"

echo ""
echo "Escrow invocation lifecycle successfully verified!"
