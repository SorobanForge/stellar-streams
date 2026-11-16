# Admin Runbook: Protocol Fee and Treasury Updates

This runbook outlines the required operational procedures for executing and verifying `set_fee` and `set_treasury` privileged contract operations on the Stellar Streams `stream` contract.

---

## 1. Safety Invariants and Constraints

1. **Strict Fee Cap (1000 bps):**
   The maximum allowable protocol fee is hard-coded at `MAX_FEE_BPS = 1000` (10.00%). Invoking `set_fee` with any value greater than 1000 returns `StreamError::InvalidFee` (code 4) and reverts.
2. **Treasury Dependency:**
   When `fee_bps > 0`, the contract deducts the protocol fee during withdrawals and forwards it to the stored treasury address. If `fee_bps > 0` but no treasury address is set, subsequent calls to `withdraw` fail with `StreamError::TreasuryNotSet` (code 11).
   **Rule:** Always configure and verify the treasury address _before_ enabling or increasing a protocol fee.
3. **Admin Key Custody:**
   Both `set_fee` and `set_treasury` require authorization from the designated admin address (`admin.require_auth()`). Unauthorized callers receive `StreamError::Unauthorized` (code 2) or host context errors.

---

## 2. Pre-Operation Checks

Run these read-only checks before initiating any changes:

1. **Query Active Configuration:**
   Retrieve current contract parameters:
   ```bash
   stellar contract invoke \
     --id <STREAM_CONTRACT_ID> \
     --source-account <ADMIN_IDENTITY> \
     --network testnet \
     -- \
     get_config
   ```
   Record the returned `admin`, `treasury`, and `fee_bps` values.
2. **Verify Destination Treasury:**
   Ensure the proposed treasury address exists on the target network, is funded, and can receive the relevant SEP-41 assets.

---

## 3. Execution Procedures

### A. Updating the Treasury Address

```bash
stellar contract invoke \
  --id <STREAM_CONTRACT_ID> \
  --source-account <ADMIN_IDENTITY> \
  --network testnet \
  -- \
  set_treasury \
  --treasury <NEW_TREASURY_ADDRESS>
```

### B. Updating the Protocol Fee

The fee is denominated in basis points (`1 bps = 0.01%`, `100 bps = 1.00%`):

```bash
stellar contract invoke \
  --id <STREAM_CONTRACT_ID> \
  --source-account <ADMIN_IDENTITY> \
  --network testnet \
  -- \
  set_fee \
  --fee_bps 250
```

_(Example above sets the fee to 2.50%)._

---

## 4. Post-Operation Verification

1. **Verify State on Ledger:**
   Query `get_config` again:

   ```bash
   stellar contract invoke \
     --id <STREAM_CONTRACT_ID> \
     --source-account <ADMIN_IDENTITY> \
     --network testnet \
     -- \
     get_config
   ```

   Confirm `treasury` matches the new address and `fee_bps` reflects the expected value.

2. **Monitor Contract Events:**
   Both functions emit structured events that should be observed on-chain:
   - `FeeUpdated`: Topic `["stream", "fee_updated"]`, payload `{ old_fee_bps: u32, new_fee_bps: u32 }`.
   - `TreasuryUpdated`: Topic `["stream", "treasury_updated"]`, payload `{ treasury: Address }`.

   Query recent contract events using `stellar-cli`:

   ```bash
   stellar contract events \
     --start-ledger <CURRENT_LEDGER - 10> \
     --id <STREAM_CONTRACT_ID> \
     --network testnet
   ```

---

## 5. Rollback Procedure

If an incorrect fee or treasury parameter was applied:

1. **Fee Rollback:**
   Invoke `set_fee` with the previous `old_fee_bps` recorded during pre-checks:

   ```bash
   stellar contract invoke \
     --id <STREAM_CONTRACT_ID> \
     --source-account <ADMIN_IDENTITY> \
     --network testnet \
     -- \
     set_fee \
     --fee_bps <PREVIOUS_FEE_BPS>
   ```

   To disable the fee immediately, set `--fee_bps 0`.

2. **Treasury Rollback:**
   Invoke `set_treasury` with the previous treasury address:
   ```bash
   stellar contract invoke \
     --id <STREAM_CONTRACT_ID> \
     --source-account <ADMIN_IDENTITY> \
     --network testnet \
     -- \
     set_treasury \
     --treasury <PREVIOUS_TREASURY_ADDRESS>
   ```
