# Admin Runbook: Fee and Treasury Changes

`set_fee` and `set_treasury` are the only privileged administrative operations in the `stream` protocol contract. Because these functions alter protocol revenue routing and fee collection, executing them requires strict adherence to pre-flight checks, exact `stellar-cli` invocations, on-chain verification, and event monitoring.

---

## 1. Overview of Privileged Operations

- **`set_fee`**: Updates the protocol fee rate expressed in basis points (bps), where 100 bps = 1%.
  - **Fee Cap**: Enforced on-chain at a maximum of **1000 bps (10%)**. Any attempt to set a fee > 1000 bps will fail with a contract error.
- **`set_treasury`**: Updates the recipient address designated to collect accumulated protocol fees.
  - **Treasury-Not-Set Failure Mode**: If a stream contract has a non-zero fee configured (`fee_bps > 0`) but no valid treasury address has been initialized (`treasury` is unset/zero), fee collection during withdrawals will fail, reverting the transaction. Always configure a valid treasury address _before_ or _simultaneously with_ enabling protocol fees.

---

## 2. Pre-Checks

Before executing any admin invocation on-chain, complete the following verification steps:

1. **Admin Key Custody**: Ensure you hold the private key/secret for the authorized contract admin account.
2. **Network Confirmation**: Verify whether you are targeting Testnet or Mainnet.
   - Testnet Passphrase: `Test SDF Network ; September 2015`
   - Mainnet Passphrase: `Public Global Stellar Network ; September 2015`
3. **Current State Inspection**: Query the existing configuration using the Soroban CLI or SDK to verify current parameters:
   ```bash
   stellar contract invoke \
     --id <STREAM_CONTRACT_ID> \
     --source <ADMIN_ALIAS_OR_SECRET> \
     --network testnet \
     -- get_config
   ```
4. **Gas & Balance Check**: Ensure the admin account has sufficient native XLM to cover transaction fees.

---

## 3. Exact CLI Invocations

All commands utilize the official `stellar` CLI.

### Setting the Protocol Fee (`set_fee`)

Pass the new fee in basis points (e.g., `50` for 0.5%, `1000` for the 10% cap):

```bash
stellar contract invoke \
  --id <STREAM_CONTRACT_ID> \
  --source <ADMIN_ALIAS_OR_SECRET> \
  --network testnet \
  --fee 100000 \
  -- set_fee \
  --fee_bps 50
```

### Setting the Treasury Address (`set_treasury`)

Pass the valid Stellar address (`G...` or contract ID depending on contract bindings) for the fee recipient:

```bash
stellar contract invoke \
  --id <STREAM_CONTRACT_ID> \
  --source <ADMIN_ALIAS_OR_SECRET> \
  --network testnet \
  --fee 100000 \
  -- set_treasury \
  --treasury <TREASURY_ADDRESS>
```

---

## 4. Verification and Rollback

### Verification

Immediately after invoking the transaction, verify the state update:

1. Run `get_config` again and check that `fee_bps` and `treasury` match the expected target values.
2. Execute a test withdrawal on a staging stream (if on Testnet) to confirm fee routing operates without triggering the treasury-not-set error.

### Rollback Procedure

If an incorrect fee or treasury was submitted:

1. **For Fees**: Immediately reinvoke `set_fee` with the correct prior basis points value.
2. **For Treasury**: Immediately reinvoke `set_treasury` with the intended valid treasury address.
3. **Emergency Disabling**: If fee collection is misbehaving and needs to be paused entirely, set the fee to `0` (`--fee_bps 0`).

---

## 5. Event Monitoring

Protocol fee and treasury modifications emit distinct on-chain events that must be tracked by indexers and monitoring systems.

- **`FeeUpdated`**: Emitted when `set_fee` succeeds.
  - **Topics**: `["FeeUpdated"]`
  - **Payload**: Contains the new fee in basis points (`fee_bps`).
- **`TreasuryUpdated`**: Emitted when `set_treasury` succeeds.
  - **Topics**: `["TreasuryUpdated"]`
  - **Payload**: Contains the new treasury address.

### Monitoring Best Practices

- Configure RPC log filters or indexer alerts (e.g., via Stellar Expert or custom event pollers) for both `FeeUpdated` and `TreasuryUpdated` topics on your deployed contract IDs.
- Any unexpected event emission outside of scheduled governance windows should trigger an automated PagerDuty / Slack alert to the engineering team.
