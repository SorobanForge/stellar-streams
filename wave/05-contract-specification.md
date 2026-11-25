# Phase 5 — Contract Specification

Precise enough for a coding agent to implement without clarifying questions. Reflects the contracts
as implemented in `contracts/`.

---

## 5.1 Contract inventory (single responsibility each)

| Contract | Single responsibility                                                                  |
| :------- | :------------------------------------------------------------------------------------- |
| `stream` | Custody one token amount and release it linearly to a recipient over `[start, end]`.   |
| `splits` | Custody one token amount for the duration of one call and pay `n` recipients by share. |
| `escrow` | Custody one token amount between two parties under an arbiter and a deadline.          |

## 5.2 Dependency graph and build order

None of the three contracts calls another. They are independent primitives that share conventions
(same TTL constants in spirit, same event style) but no code. Therefore:

**Build/deploy order: any order; there is no cross-contract dependency.** The recommended deploy
order is `stream` → `splits` → `escrow` (flagship first), and this is what the scripts do.

Each contract depends only on the external **SEP-41 token contract** (the SAC or an issued asset),
which must already exist on the target network.

```
[soroban-sdk 27.0.0]  ──uses──>  stream | splits | escrow  ──calls──> token (SAC/SEP-41)
```

## 5.3 Shared conventions

- Rust edition 2021, `#![no_std]`, `soroban-sdk = "27.0.0"`, target `wasm32v1-none`.
- Every state-changing entry point calls `require_auth()` on the actor it needs, **after**
  validating cheap invariants and **before** moving funds.
- Errors are a `#[contracterror] #[repr(u32)]` enum. No panics for user error.
- Persistent entries are TTL-bumped on every write.
- Events are topic-tagged `(symbol, symbol, id)`.

---

## 5.4 `stream` contract

### Storage types

```rust
struct Stream {
    id: u64, sender: Address, recipient: Address, token: Address,
    total_amount: i128, withdrawn: i128,
    start_time: u64, end_time: u64, cliff_time: u64, cancelled: bool,
}
struct Config { admin: Address, treasury: Address, fee_bps: u32 }

enum DataKey { Stream(u64), NextId, Admin, Treasury, FeeBps }
```

Storage placement:

- `Stream(id)` → **persistent**, bumped `(17_280, 518_400)` ledgers (~1 day threshold, ~30 day limit).
- `NextId`, `Admin`, `Treasury`, `FeeBps` → **instance**, bumped `(17_280, 518_400)`.

Constants: `LEDGER_BUMP_THRESHOLD = 17_280`, `LEDGER_BUMP_LIMIT = 518_400`, `MAX_FEE_BPS = 1_000`.

### Errors (`StreamError`)

`InvalidAmount=1, InvalidTimeRange=2, InvalidCliff=3, StreamNotFound=4, NothingToWithdraw=5,
Unauthorized=6, InvalidFee=7, AlreadyCancelled=8, AlreadyInitialized=9, TreasuryNotSet=10`

### Functions

| Function         | Params                                                                                   | Returns                     | Auth                       | Notes                                                                                                                                                                                                                                                         |
| :--------------- | :--------------------------------------------------------------------------------------- | :-------------------------- | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initialize`     | `admin: Address, treasury: Address, fee_bps: u32`                                        | `Result<(), StreamError>`   | `admin.require_auth()`     | One-shot. `fee_bps ≤ 1000` else `InvalidFee`. Sets `NextId=1`.                                                                                                                                                                                                |
| `set_fee`        | `fee_bps: u32`                                                                           | `Result<(), StreamError>`   | `admin.require_auth()`     | `≤ 1000`. `Unauthorized` if uninitialized.                                                                                                                                                                                                                    |
| `set_treasury`   | `treasury: Address`                                                                      | `Result<(), StreamError>`   | `admin.require_auth()`     | `Unauthorized` if uninitialized.                                                                                                                                                                                                                              |
| `create_stream`  | `sender, recipient, token: Address; amount: i128; start_time, end_time, cliff_time: u64` | `Result<u64, StreamError>`  | `sender.require_auth()`    | Validates `amount>0`, `end>start`, `start ≤ cliff ≤ end`. Pulls `amount` sender→contract. Returns new id. Bumps instance TTL.                                                                                                                                 |
| `withdraw`       | `stream_id: u64`                                                                         | `Result<i128, StreamError>` | `recipient.require_auth()` | Computes `vested`, `claimable=vested-withdrawn`. `NothingToWithdraw` if `≤0`. Takes `fee = claimable*fee_bps/10_000` to treasury (returns `TreasuryNotSet` if fee>0 and unset), transfers `net` to recipient. Sets `withdrawn += claimable`. Returns **net**. |
| `cancel`         | `stream_id: u64`                                                                         | `Result<(), StreamError>`   | `sender.require_auth()`    | `AlreadyCancelled` if already. Refunds `unvested` to sender; compresses schedule so `total_amount=vested`, `start=end=cliff=now`, `cancelled=true`. Vested stays withdrawable.                                                                                |
| `claimable`      | `stream_id: u64`                                                                         | `Result<i128, StreamError>` | none (view)                | `max(vested - withdrawn, 0)`.                                                                                                                                                                                                                                 |
| `vested`         | `stream_id: u64`                                                                         | `Result<i128, StreamError>` | none (view)                | `vested_amount(now)`.                                                                                                                                                                                                                                         |
| `get_stream`     | `stream_id: u64`                                                                         | `Option<Stream>`            | none                       |                                                                                                                                                                                                                                                               |
| `get_config`     | —                                                                                        | `Option<Config>`            | none                       | `None` if uninitialized.                                                                                                                                                                                                                                      |
| `next_stream_id` | —                                                                                        | `u64`                       | none                       | Defaults `1`.                                                                                                                                                                                                                                                 |

### Vesting math

```
vested_amount(stream, now):
  if now < start_time OR now < cliff_time: 0
  if now >= end_time:                      total_amount
  else: total_amount * (now - start_time) / (end_time - start_time)   // integer
```

### Events

| Topic                        | Data                          | Emitted by      |
| :--------------------------- | :---------------------------- | :-------------- |
| `("stream","created", id)`   | `(sender, recipient, amount)` | `create_stream` |
| `("stream","withdrawn", id)` | `(recipient, net, fee)`       | `withdraw`      |
| `("stream","cancelled", id)` | `(sender, unvested)`          | `cancel`        |

---

## 5.5 `splits` contract

### Storage types

```rust
struct Split { id: u64, creator: Address, recipients: Vec<Address>, shares: Vec<u32>, total_shares: u32 }
enum DataKey { Split(u64), NextId }
```

`Split(id)` → persistent, bumped `(17_280, 518_400)`. `NextId` → instance.

### Errors (`SplitError`)

`EmptyRecipients=1, LengthMismatch=2, InvalidShares=3, InvalidAmount=4, DuplicateRecipient=5,
SplitNotFound=6, Unauthorized=7`

### Functions

| Function        | Params                                                         | Returns                   | Auth                     | Notes                                                                                                                                |
| :-------------- | :------------------------------------------------------------- | :------------------------ | :----------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `create_split`  | `creator: Address, recipients: Vec<Address>, shares: Vec<u32>` | `Result<u64, SplitError>` | `creator.require_auth()` | Non-empty, equal lengths, non-zero shares, no duplicate recipients. Computes `total_shares`. Returns id.                             |
| `distribute`    | `split_id: u64, from: Address, token: Address, amount: i128`   | `Result<(), SplitError>`  | `from.require_auth()`    | `amount>0`. Pulls `amount` from→contract, pays each recipient `amount*share/total`; **final recipient gets the rounding remainder**. |
| `get_split`     | `split_id: u64`                                                | `Option<Split>`           | none                     |                                                                                                                                      |
| `next_split_id` | —                                                              | `u64`                     | none                     |                                                                                                                                      |

### Events

| Topic                      | Data                      |
| :------------------------- | :------------------------ |
| `("splits","created", id)` | `(creator, total_shares)` |
| `("splits","distrib", id)` | `(from, token, amount)`   |

> Note: the `distribute` topic symbol is `"distrib"` (7-char `symbol_short!` limit), not
> `"distributed"`. Preserve this exactly when writing indexers.

---

## 5.6 `escrow` contract

### Storage types

```rust
enum EscrowStatus { Created=0, Funded=1, Released=2, Refunded=3, Cancelled=4 }
struct Escrow {
    id: u64, payer: Address, payee: Address, arbiter: Address,
    token: Address, amount: i128, deadline: u64, status: EscrowStatus,
}
enum DataKey { Escrow(u64) }
```

`Escrow(id)` → persistent, bumped `(10_000, 50_000)` (~1.5d / ~7d). **Note:** escrow uses _different_
TTL constants from stream/splits — a known inconsistency; see Phase 13 issue list.

IDs are **caller-supplied** (`create_escrow(id, …)`), not auto-incremented, unlike stream/splits.

### Errors (`EscrowError`)

`EscrowNotFound=1, EscrowAlreadyExists=2, InvalidAmount=3, UnauthorizedOperation=4,
InvalidStateTransition=5, DeadlineNotReached=6, DeadlineExpired=7, AlreadyFinalized=8`

### State machine

```
Created ──fund──> Funded ──release(payer|arbiter)──> Released
   │                 ├──refund(payee|arbiter)──────> Refunded
   │                 └──cancel(payer, after deadline)─> Cancelled
   └──cancel(payer, unfunded)───────────────────────> Cancelled
```

Terminal states: `Released`, `Refunded`, `Cancelled` — any further transition returns
`AlreadyFinalized`.

### Functions

| Function         | Params                                                                   | Returns                   | Auth                    | Notes                                                                                                            |
| :--------------- | :----------------------------------------------------------------------- | :------------------------ | :---------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `create_escrow`  | `id, payer, payee, arbiter, token: Address, amount: i128, deadline: u64` | `Result<(), EscrowError>` | `payer.require_auth()`  | `EscrowAlreadyExists` if id taken; `amount>0`. Status `Created`.                                                 |
| `fund_escrow`    | `id: u64`                                                                | `Result<(), EscrowError>` | `payer.require_auth()`  | Only from `Created`. Pulls `amount` payer→contract.                                                              |
| `release_escrow` | `id: u64, caller: Address`                                               | `Result<(), EscrowError>` | `caller.require_auth()` | Only from `Funded`. `caller` must be payer or arbiter. Pays payee.                                               |
| `refund_escrow`  | `id: u64, caller: Address`                                               | `Result<(), EscrowError>` | `caller.require_auth()` | Only from `Funded`. `caller` must be payee or arbiter. Pays payer.                                               |
| `cancel_escrow`  | `id: u64, caller: Address`                                               | `Result<(), EscrowError>` | `caller.require_auth()` | Caller must be payer. `Created`→cancel free; `Funded`→only after deadline (`DeadlineNotReached`), refunds payer. |
| `get_escrow`     | `id: u64`                                                                | `Option<Escrow>`          | none                    |                                                                                                                  |

### Events

| Topic                        | Data                      |
| :--------------------------- | :------------------------ |
| `("escrow","created", id)`   | `(payer, amount)`         |
| `("escrow","funded", id)`    | `amount`                  |
| `("escrow","released", id)`  | `(caller, payee, amount)` |
| `("escrow","refunded", id)`  | `(caller, payer, amount)` |
| `("escrow","cancelled", id)` | `payer`                   |

---

## 5.7 Function-to-user-flow mapping (no speculative functions)

| User flow step                           | Contract call                                    |
| :--------------------------------------- | :----------------------------------------------- |
| Employer locks a 30-day salary stream    | `stream.create_stream`                           |
| Employee checks what has accrued         | `stream.claimable` / `stream.vested`             |
| Employee withdraws                       | `stream.withdraw`                                |
| Employer ends a stream early             | `stream.cancel`                                  |
| Platform configures a revenue split once | `splits.create_split`                            |
| Platform pays a sale to all contributors | `splits.distribute`                              |
| Two parties agree on a deal              | `escrow.create_escrow`                           |
| Buyer deposits                           | `escrow.fund_escrow`                             |
| Arbiter resolves                         | `escrow.release_escrow` / `escrow.refund_escrow` |
| Buyer cancels an unfunded/expired deal   | `escrow.cancel_escrow`                           |

Every public function maps to a step above. No function exists "just in case."

---

## 5.8 Milestone escrow releases (#189)

Escrow supports an optional milestone schedule so freelance work can be paid in
increments. The schedule is additive: escrows without one keep the existing
single `release_escrow` behaviour.

### Data

- `DataKey::Milestones(id) -> Vec<i128>` — positive amounts that must sum exactly
  to `Escrow.amount`.
- `DataKey::MilestoneReleased(id) -> Vec<u32>` — `0`/`1` flags, one per milestone.

Both keys are persistent and TTL-bumped on write. No existing key or error
discriminant is renumbered.

### Entry points

- `set_milestones(id, caller, amounts)` — payer only, `Created` only, at least
  two positive amounts, checked sum equal to the escrow amount.
- `release_milestone(id, milestone_index, caller)` — payer or arbiter only,
  `Funded` only, before/at `deadline`; index must be in range and unreleased.
  Transfers only that milestone to the payee and emits `MilestoneReleased`.
  Releasing the final milestone moves the escrow to `Released`.
- `get_milestones(id)` / `is_milestone_released(id, index)` — read-only views.

`release_escrow` rejects milestone escrows (`InvalidStateTransition`) so a full
release cannot bypass the schedule. `refund_escrow` and the deadline path of
`cancel_escrow` return `Escrow.amount - sum(released milestones)` to the payer,
so unreleased milestones are refunded and released milestones are never
double-paid.

### Errors

New variants appended: `MilestoneScheduleNotFound = 10`,
`MilestoneIndexOutOfRange = 11`, `MilestoneAlreadyReleased = 12`,
`MilestoneScheduleInvalid = 13`.

### Boundary rules

- Index `>= len` → `MilestoneIndexOutOfRange`.
- Duplicate release → `MilestoneAlreadyReleased`.
- Any release when `now > deadline` → `DeadlineExpired`.
- Schedule with fewer than two entries, a non-positive entry, or a sum that does
  not equal `Escrow.amount` → `MilestoneScheduleInvalid`.
