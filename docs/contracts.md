# Contract reference

Entry points, error codes, and event shapes for the three Soroban contracts in
`contracts/`. This page is the written form of what integrators currently have to
read out of Rust: a client mapping a failure to a user-facing message, and an
indexer decoding an event, should not need to compile the contract to know what
code `7` means or what the third topic is.

The Rust source is the source of truth. If this page and `contracts/*/src/lib.rs`
disagree, the source wins and this page has a bug — please open an issue.

Numeric error codes are part of the public interface. `packages/contracts/src/generated/*/src/index.ts`
embeds the same numbers in the generated bindings, and `@stellar-starter-kit/sdk`
surfaces them to callers, so a variant must never be renumbered or removed:
**append only.**

---

## `stream` — `StreamContract`

Linear payment streams: tokens are locked in the contract and vest continuously
between `start_time` and `end_time`, with an optional cliff.

### Entry points

| Function             | Arguments                                                                                                                                              | Returns                                                                 | Auth                                           |
| :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------- |
| `initialize`         | `admin: Address, treasury: Address, fee_bps: u32`                                                                                                      | `Result<(), StreamError>`                                               | `admin`                                        |
| `set_fee`            | `fee_bps: u32`                                                                                                                                         | `Result<(), StreamError>`                                               | stored `admin`                                 |
| `set_treasury`       | `treasury: Address`                                                                                                                                    | `Result<(), StreamError>`                                               | stored `admin`                                 |
| `create_stream`      | `sender: Address, recipient: Address, token: Address, amount: i128, start_time: u64, end_time: u64, cliff_time: u64, label: String, reference: String` | `Result<u64, StreamError>` — the new stream id                          | `sender`                                       |
| `withdraw`           | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — net amount paid after fee                 | `recipient`                                    |
| `cancel`             | `stream_id: u64`                                                                                                                                       | `Result<(), StreamError>`                                               | `sender`                                       |
| `transfer_recipient` | `stream_id: u64, caller: Address, new_recipient: Address`                                                                                              | `Result<(), StreamError>`                                               | `caller`, which must be the stored `recipient` |
| `claimable`          | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — vested minus already withdrawn, floor `0` | —                                              |
| `vested`             | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — total vested so far                       | —                                              |
| `get_stream`         | `stream_id: u64`                                                                                                                                       | `Option<Stream>`                                                        | —                                              |
| `get_config`         | —                                                                                                                                                      | `Option<Config>` (`None` if uninitialized)                              | —                                              |
| `next_stream_id`     | —                                                                                                                                                      | `u64` (`1` on a fresh deploy)                                           | —                                              |

Types returned by the views:

```rust
struct Stream {
    id: u64, sender: Address, recipient: Address, token: Address,
    total_amount: i128, withdrawn: i128,
    start_time: u64, end_time: u64, cliff_time: u64,
    label: String, reference: String,
    cancelled: bool,
}
struct Config { admin: Address, treasury: Address, fee_bps: u32 }
```

`label` and `reference` are optional, purely descriptive metadata — a payroll
label and an invoice/grant id. They never affect vesting, are stored as empty
`String`s when the creator passes none, and are capped by length at call time:
`label` at 64 bytes (`MAX_LABEL_LEN`), `reference` at 128 bytes
(`MAX_REFERENCE_LEN`), compared against `String::len()` so the limit is the
encoded byte length, not a character count. Longer input is code `11`.

`cancel` compresses the schedule on the way out: `total_amount` becomes the
vested amount and `start_time`, `end_time` and `cliff_time` are all set to now, so
the already-vested remainder stays withdrawable by the recipient and nothing else
can accrue. A client reading `end_time` after a cancel therefore sees the
cancellation timestamp, not the one it created the stream with.

`transfer_recipient` rewrites only `recipient`: `withdrawn`, `total_amount` and
the schedule are untouched, so tokens already paid out stay with the old address
and everything not yet withdrawn becomes withdrawable by the new one. That
includes a balance that has vested but was never claimed, so a recipient who
wants to keep it should `withdraw` before handing off. The recipient is checked
by comparing an explicit `caller` (which must sign) against the stored address
rather than by calling `recipient.require_auth()`, so that any other signer
gets a typed `Unauthorized` instead of a host auth trap. It works on cancelled
streams too, which lets a recipient move a still-unclaimed vested remainder.

### Errors — `StreamError` (`#[repr(u32)]`)

| Code | Variant              | Produced when                                                                                                                                                                                                                                                                  |
| :--: | :------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1   | `InvalidAmount`      | `create_stream` with `amount <= 0`.                                                                                                                                                                                                                                            |
|  2   | `InvalidTimeRange`   | `create_stream` with `end_time <= start_time`.                                                                                                                                                                                                                                 |
|  3   | `InvalidCliff`       | `create_stream` with `cliff_time < start_time` or `cliff_time > end_time`.                                                                                                                                                                                                     |
|  4   | `StreamNotFound`     | No stored stream under `stream_id` — raised by `withdraw`, `cancel`, `claimable`, `vested`. Also what a recipient sees if a persistent entry was archived after its TTL lapsed.                                                                                                |
|  5   | `NothingToWithdraw`  | `withdraw` when `vested(now) - withdrawn <= 0` — before the cliff, at the start of a stream, after a full withdrawal, or for a stream whose vested amount is `0`.                                                                                                              |
|  6   | `Unauthorized`       | `set_fee` or `set_treasury` called before `initialize` stored an admin, or `transfer_recipient` with a `caller` other than the stream's current recipient. Otherwise a wrong-signer call is not this code: `require_auth()` traps with a `Context` error before the body runs. |
|  7   | `InvalidFee`         | `fee_bps > 1000` (the 10 % cap) in `initialize` or `set_fee`.                                                                                                                                                                                                                  |
|  8   | `AlreadyCancelled`   | `cancel` on a stream whose `cancelled` flag is already set.                                                                                                                                                                                                                    |
|  9   | `AlreadyInitialized` | A second `initialize` call — the presence of `DataKey::Admin` is the guard.                                                                                                                                                                                                    |
|  10  | `TreasuryNotSet`     | `withdraw` when the fee is non-zero but no treasury address is stored.                                                                                                                                                                                                         |
|  11  | `MetadataTooLong`    | `create_stream` when `label.len() > 64` or `reference.len() > 128`. Checked with the other arguments, before any token moves.                                                                                                                                                  |
|  12  | `SameRecipient`      | `transfer_recipient` when `new_recipient` is already the stream's recipient, so a no-op hand-off never emits a `transferred` event.                                                                                                                                            |

`STREAM_ERROR_CODES` in `packages/sdk/src/index.ts` is the one place these
numbers are named on the client side; codes outside that table fall back to the
raw diagnostics message rather than failing the call.

### Events

Each contract emits three topics — `(contract tag, action, id)` — with the `id`
as a `u64` in topic three. The remaining fields are the event _data_, emitted as
a **map keyed by field name** (the `#[contractevent]` struct's non-`#[topic]`
fields), not as a positional tuple, so decoding does not depend on field order.

| Topics                               | Data fields                                                                                   | Published by         |
| :----------------------------------- | :-------------------------------------------------------------------------------------------- | :------------------- |
| `("stream", "created", id: u64)`     | `sender: Address`, `recipient: Address`, `amount: i128`, `label: String`, `reference: String` | `create_stream`      |
| `("stream", "withdrawn", id: u64)`   | `recipient: Address`, `amount: i128`, `fee: i128`                                             | `withdraw`           |
| `("stream", "cancelled", id: u64)`   | `sender: Address`, `refunded: i128`                                                           | `cancel`             |
| `("stream", "transferred", id: u64)` | `old_recipient: Address`, `new_recipient: Address`                                            | `transfer_recipient` |

The Rust event types are `StreamCreated`, `StreamWithdrawn`, `StreamCancelled`
and `StreamRecipientTransferred`; their field names are exactly the map keys
above. An indexer tracking who a stream pays should start from `created`'s
`recipient` and follow each `transferred` event. `amount` on
`withdrawn` is what the recipient actually received and `fee` what the treasury
received — they sum to the gross claimable amount. `cancelled` carries only the
refunded unvested portion: the recipient's vested remainder is still to be
withdrawn, so it shows up in a later `withdrawn` event, not here.

---

## `splits` — `SplitsContract`

Immutable, reusable split configurations: a set of recipients with proportional
weights. Anyone may pay into a split and funds distribute on the spot.

### Entry points

| Function        | Arguments                                                      | Returns                                      | Auth      |
| :-------------- | :------------------------------------------------------------- | :------------------------------------------- | :-------- |
| `create_split`  | `creator: Address, recipients: Vec<Address>, shares: Vec<u32>` | `Result<u64, SplitError>` — the new split id | `creator` |
| `distribute`    | `split_id: u64, from: Address, token: Address, amount: i128`   | `Result<(), SplitError>`                     | `from`    |
| `get_split`     | `split_id: u64`                                                | `Option<Split>`                              | —         |
| `next_split_id` | —                                                              | `u64` (`1` on a fresh deploy)                | —         |

```rust
struct Split {
    id: u64, creator: Address,
    recipients: Vec<Address>, shares: Vec<u32>, total_shares: u32,
}
```

`shares[i]` is the weight of `recipients[i]`; the two vectors are positionally
paired and must be the same length. A share is a weight, not a percentage —
`[3, 1]` is a 75/25 split.

### Errors — `SplitError` (`#[repr(u32)]`)

| Code | Variant              | Produced when                                                                                                                                                                                                                   |
| :--: | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  1   | `EmptyRecipients`    | `create_split` with an empty `recipients` vector.                                                                                                                                                                               |
|  2   | `LengthMismatch`     | `create_split` when `shares.len() != recipients.len()`.                                                                                                                                                                         |
|  3   | `InvalidShares`      | `create_split` when any share is `0`.                                                                                                                                                                                           |
|  4   | `InvalidAmount`      | `distribute` with `amount <= 0`. Checked **before** `from`'s auth and before the split lookup, so a zero amount is rejected even against a nonexistent split.                                                                   |
|  5   | `DuplicateRecipient` | `create_split` when an address appears twice, in any position.                                                                                                                                                                  |
|  6   | `SplitNotFound`      | `distribute` for an unregistered `split_id` (or an archived entry).                                                                                                                                                             |
|  7   | `Unauthorized`       | **Defined but never returned.** Kept so existing codes keep their values. Authorization failures in this contract surface as a Soroban `Context` error from `require_auth()`, not as this code — a client must not wait for it. |

Rounding: each non-final recipient receives `amount * shares[i] / total_shares`
(integer division, truncating) and the **final** recipient receives
`amount - distributed`, so the portions always sum to exactly `amount` and no
stroop is stranded. Only the last recipient absorbs the remainder, so a caller
who wants to predict one person's portion must simulate the whole vector.

### Events

| Topics                           | Data fields                                       | Published by   |
| :------------------------------- | :------------------------------------------------ | :------------- |
| `("splits", "created", id: u64)` | `creator: Address`, `total_shares: u32`           | `create_split` |
| `("splits", "distrib", id: u64)` | `from: Address`, `token: Address`, `amount: i128` | `distribute`   |

The Rust event types are `SplitCreated` and `SplitDistributed`. Note the second
symbol of the payout event is `distrib`, not `distributed` — a topic symbol is
limited to nine characters, and the truncation is part of the topic a decoder
must match. The contract publishes one `distrib` event per payout even though
the call performs `1 + n` token transfers; a balance-tracking indexer should
read the transfers, while the event is the record of _why_ they happened.

---

## `escrow` — `EscrowContract`

Two-party payment with a third-party arbiter, keyed by a caller-chosen id, with
deadline-driven cancellation.

### Entry points

| Function         | Arguments                                                                                                | Returns                   | Auth                                       |
| :--------------- | :------------------------------------------------------------------------------------------------------- | :------------------------ | :----------------------------------------- |
| `create_escrow`  | `id: u64, payer: Address, payee: Address, arbiter: Address, token: Address, amount: i128, deadline: u64` | `Result<(), EscrowError>` | `payer`                                    |
| `fund_escrow`    | `id: u64`                                                                                                | `Result<(), EscrowError>` | `payer`                                    |
| `release_escrow` | `id: u64, caller: Address`                                                                               | `Result<(), EscrowError>` | `caller`, who must be `payer` or `arbiter` |
| `refund_escrow`  | `id: u64, caller: Address`                                                                               | `Result<(), EscrowError>` | `caller`, who must be `payee` or `arbiter` |
| `cancel_escrow`  | `id: u64, caller: Address`                                                                               | `Result<(), EscrowError>` | `caller`, who must be `payer`              |
| `get_escrow`     | `id: u64`                                                                                                | `Option<Escrow>`          | —                                          |

```rust
struct Escrow {
    id: u64, payer: Address, payee: Address, arbiter: Address, token: Address,
    amount: i128, deadline: u64, status: EscrowStatus,
}

#[repr(u32)]
enum EscrowStatus { Created = 0, Funded = 1, Released = 2, Refunded = 3, Cancelled = 4 }
```

Unlike `stream` and `splits`, the escrow id is **supplied by the caller** to
`create_escrow`; it is not issued by the contract, so ids are only unique per
deployer discipline, and reusing a live id returns code `2`.

`release_escrow` and `refund_escrow` take `caller` as an explicit argument and
compare it against the stored roles after `caller.require_auth()`. That argument
is not trusted as an identity claim on its own — it is the address that must have
signed, and a mismatch between the signer and `caller` fails at `require_auth()`.

### Status transitions

| From                                  | `fund`     | `release`    | `refund`     | `cancel`                                                  |
| :------------------------------------ | :--------- | :----------- | :----------- | :-------------------------------------------------------- |
| `Created` (unfunded)                  | → `Funded` | 5            | 5            | → `Cancelled`, no transfer                                |
| `Funded`                              | 5          | → `Released` | → `Refunded` | → `Cancelled` + refund, **only past `deadline`** (else 6) |
| `Released` / `Refunded` / `Cancelled` | 5          | 8            | 8            | 8                                                         |

### Errors — `EscrowError` (`#[repr(u32)]`)

| Code | Variant                  | Produced when                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :--: | :----------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1   | `EscrowNotFound`         | No stored escrow under `id` — `fund_escrow`, `release_escrow`, `refund_escrow`, `cancel_escrow`.                                                                                                                                                                                                                                                                                                                                              |
|  2   | `EscrowAlreadyExists`    | `create_escrow` with an `id` already in storage.                                                                                                                                                                                                                                                                                                                                                                                              |
|  3   | `InvalidAmount`          | `create_escrow` with `amount <= 0`. Checked after the duplicate-id test and before `payer`'s auth.                                                                                                                                                                                                                                                                                                                                            |
|  4   | `UnauthorizedOperation`  | `release_escrow` by an address that is neither `payer` nor `arbiter`; `refund_escrow` by an address that is neither `payee` nor `arbiter`; `cancel_escrow` by anyone other than `payer`.                                                                                                                                                                                                                                                      |
|  5   | `InvalidStateTransition` | `fund_escrow` when not `Created`; `release_escrow`/`refund_escrow` while still `Created` (funds have not been locked yet).                                                                                                                                                                                                                                                                                                                    |
|  6   | `DeadlineNotReached`     | `cancel_escrow` on a `Funded` escrow while `ledger().timestamp() < deadline`.                                                                                                                                                                                                                                                                                                                                                                 |
|  7   | `DeadlineExpired`        | **Defined but never returned.** Kept so existing codes keep their values. Nothing in the contract raises it: the deadline check on `cancel_escrow` returns 6 when the deadline has _not_ been reached, and `release_escrow`/`refund_escrow` do not consult `deadline` at all — a funded escrow stays releasable after its deadline indefinitely. A client must not wait for this code, and must not assume a passed deadline locks an escrow. |
|  8   | `AlreadyFinalized`       | `release_escrow`, `refund_escrow`, or `cancel_escrow` on an escrow already in `Released`, `Refunded` or `Cancelled`.                                                                                                                                                                                                                                                                                                                          |

### Events

| Topics                             | Data fields                                         | Published by     |
| :--------------------------------- | :-------------------------------------------------- | :--------------- |
| `("escrow", "created", id: u64)`   | `payer: Address`, `amount: i128`                    | `create_escrow`  |
| `("escrow", "funded", id: u64)`    | `amount: i128`                                      | `fund_escrow`    |
| `("escrow", "released", id: u64)`  | `caller: Address`, `payee: Address`, `amount: i128` | `release_escrow` |
| `("escrow", "refunded", id: u64)`  | `caller: Address`, `payer: Address`, `amount: i128` | `refund_escrow`  |
| `("escrow", "cancelled", id: u64)` | `payer: Address`                                    | `cancel_escrow`  |

The Rust event types are `EscrowCreated`, `EscrowFunded`, `EscrowReleased`,
`EscrowRefunded` and `EscrowCancelled`. `released` and `refunded` are the only
events that name both the actor who signed (`caller`) and the destination, so
they are the pair to join against a token transfer when reconciling.

`cancelled` is the one lifecycle event that carries **no amount**: it fires both
when an unfunded escrow is dropped and when a funded one is reclaimed after its
deadline, so an indexer cannot tell from the event alone whether funds moved.
Read the escrow's stored `amount`, or the token transfers, to work out which
case happened.

---

## Cross-contract conventions

- **Auth failures are not error codes.** Every state-changing entry point calls
  `require_auth()` on the actor it needs, and a missing or wrong signature is a
  Soroban `Context` error at the host level, not one of the codes above. The
  `Unauthorized`-style variants in these enums describe _in-contract_ role
  mismatches (or, in two cases, nothing at all — see codes `7` for splits and `7`
  for escrow).
- **Amounts are `i128` in the token's smallest unit; weights and ids are `u32`/`u64`.**
- **Events are declared, not hand-published.** Each contract names its events with
  `#[contractevent(topics = [..])]` on a struct whose `#[topic]` field is the
  record id, and calls `.publish(&env)`. That is why every payload is a named map
  and why a client can type the decode against the exported struct instead of
  positional slots.
- **Timestamps are `u64` ledger timestamps**, and every time comparison is against
  `env.ledger().timestamp()` at call time.
- **Views return `Option`/`Result`, and nothing here panics on user error** — a
  recoverable problem is always a typed error.
- **TTLs are bumped on every write** (`17_280` / `518_400` ledgers in `stream` and
  `splits`, `10_000` / `50_000` in `escrow`), so a used entry survives; an idle one
  can be archived, which surfaces as `StreamNotFound`/`SplitNotFound`/`EscrowNotFound`
  rather than as a distinct "expired" signal.
