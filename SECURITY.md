# Security Policy

## Supported Versions

We actively support and patch security issues in the following versions of Stellar Streams:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

We take the security of our project seriously. If you find a security vulnerability, please do **not** report it publicly through GitHub issues. Instead, please follow the steps below:

1. Send an email to **ademolabuild@gmail.com** with details of the vulnerability.
2. Include a description of the vulnerability, steps to reproduce, and any potential exploits.
3. We will acknowledge receipt of your report within 48 hours and coordinate a fix.
4. We will release a security patch and public disclosure once the issue has been resolved.

Thank you for helping keep this project secure!

---

## Security model

This section documents the protocol's **trust assumptions**: what each actor can and cannot do,
and which risks are inherent to the current design. It is written against the Rust contract source
(`contracts/*/src/lib.rs`), which is the reference implementation. Entry points, error codes, and
event shapes are enumerated in [docs/contracts.md](docs/contracts.md).

### Actor powers, per contract

#### `stream`

| Actor         | Powers                                                                                                                                                                                                               | Cannot                                                                                                                                                                                                       |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sender**    | Creates a stream (which pulls the **full** amount into the contract up front, requiring the sender's signature and a token allowance); cancels it at any time, which refunds the **unvested** remainder immediately. | Cannot touch funds once vested; cannot change the recipient; cannot cancel twice.                                                                                                                            |
| **Recipient** | Withdraws the vested-but-unclaimed balance at any time (protocol fee deducted at withdrawal). The recipient address is fixed at creation.                                                                            | Cannot be changed or impersonated — `withdraw` requires the recipient's signature; cannot withdraw pre-cliff funds.                                                                                          |
| **Admin**     | Set once via `initialize` (callable exactly once). Afterwards: `set_fee` (capped at 1000 bps = 10%) and `set_treasury`.                                                                                              | **Cannot touch locked funds.** No upgrade, no pause, no withdrawal entry point, no ability to change a stream's sender/recipient/token. The admin's entire leverage is the fee rate on _future_ withdrawals. |
| **Treasury**  | Receives the protocol fee on each withdrawal.                                                                                                                                                                        | Cannot initiate anything; it is a passive destination address. Note: before the first `initialize`, a `withdraw` against a fee-bearing stream fails with `TreasuryNotSet`.                                   |
| **Anyone**    | Reads `get_stream`, `claimable`, `vested`, `get_config`, `next_stream_id`.                                                                                                                                           | Cannot mutate state.                                                                                                                                                                                         |

Cancellation is **cancel-safe by construction**: the sender is refunded only the unvested portion
(`total − vested` at the cancel timestamp) and the schedule is compressed so the recipient's
already-vested balance remains withdrawable.

#### `splits`

| Actor              | Powers                                                                                                                                     | Cannot                                                                               |
| :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **Creator**        | Registers an immutable split (non-empty recipients, matching non-zero shares, no duplicates).                                              | Cannot modify or delete a split after creation; cannot claw back funds paid into it. |
| **Payer** ("from") | Any address that signs `distribute` pays in the amount and triggers the distribution.                                                      | Cannot choose different shares — the split's configuration is fixed on-chain.        |
| **Recipients**     | Receive `amount × share / total_shares` per distribution (integer math; rounding dust goes to the final recipient so nothing is stranded). | Cannot pull funds; recipients must wait for someone to call `distribute`.            |
| **Admin**          | None. The splits contract has **no admin, no fee, and no owner**.                                                                          | —                                                                                    |

#### `escrow`

| Actor       | Powers                                                                                                                                                                                    | Cannot                                                                                                    |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| **Payer**   | Creates the agreement (payer-signed) and funds it (payer-signed transfer into the contract). May cancel while unfunded at any time, and after the deadline once funded. May also release. | Cannot refund unilaterally before the deadline.                                                           |
| **Payee**   | May refund the escrow back to the payer once funded.                                                                                                                                      | **Cannot self-release** — release requires the payer or the arbiter.                                      |
| **Arbiter** | Full discretionary power once funded: may `release_escrow` (payee is paid) **or** `refund_escrow` (payer is paid), at any time, before or after the deadline.                             | Cannot cancel, cannot move funds to a third party, cannot act on an unfunded or already-finalized escrow. |
| **Anyone**  | Reads `get_escrow`.                                                                                                                                                                       | Cannot mutate state.                                                                                      |

Key escrow consequence for integrators: **the arbiter is a trusted third party in the full sense**
of the word — a single arbiter signature can irrevocably move the escrowed funds to either side.
Choose arbiters accordingly, and note there is no appeal path on-chain.

### Inherent risks (read before integrating)

- **No upgradeability.** The contracts are deliberately non-upgradeable: there is no proxy, no
  migration entry point, and no admin escape hatch. A bug in deployed bytecode cannot be patched in
  place — mitigating one requires deploying a new contract and persuading users to migrate funds
  (for `stream`, by cancelling and re-creating). This cuts both ways: no admin can rug-patch the
  rules either.
- **Unaudited contracts.** No third-party security audit has been performed. The contracts are
  unit-tested (29 tests) and lint-clean, but that is not a substitute for review. Treat the
  pre-1.0 contracts as un-audited software and do not secure material Mainnet value with them.
- **Admin key custody (`stream` only).** The stream admin can raise the protocol fee up to 10% and
  redirect the treasury address. A compromised admin can therefore increase the cost of _future_
  withdrawals and redirect fees, but **cannot** steal already-locked principal or bypass
  sender/recipient signatures. Rotate custody to a multisig before any Mainnet deployment, and
  note that `initialize` is one-shot — the admin is permanent for the life of the instance.
- **TTL expiry.** Stream, split, and escrow records live in Soroban persistent storage and expire
  unless their TTL is extended. Every write bumps the entry (~1 day threshold, ~30 days maximum
  per bump), but **no one can call a write for you**: if a stream or escrow is left dormant for
  longer than its remaining TTL (roughly a month at worst), its ledger entry expires and the funds
  held in the contract become unrecoverable — there is no rebuild-from-events entry point. Monitor
  long-lived streams and bump them (any state-mutating call on the record extends it).
- **Lost wallet keys.** There is no key recovery, no admin recovery, and no governance override. If
  the **recipient** loses their key, all unwithdrawn vested funds are permanently locked; if the
  **sender** loses their key before cancelling, the unvested remainder can never be refunded. The
  same applies to escrow payers, payees, and arbiters.
- **Token assumptions.** Contracts hold balances of arbitrary SEP-41 tokens. A malicious or
  non-standard token (rebasing, fee-on-transfer, blacklisting) can break the arithmetic or
  invariants the contracts assume; only use tokens whose transfer semantics you trust.

### Audit status

The protocol is **pre-1.0 and unaudited**. A third-party audit and a 1.0 contract freeze are on the
[roadmap](ROADMAP.md) ("Later" milestone) but are not scheduled commitments. The README's project
status callout carries the same warning.

Integrators should re-read this file and [ROADMAP.md](ROADMAP.md) before Mainnet use.
