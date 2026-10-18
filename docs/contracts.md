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

| Function         | Arguments                                                                                                                                              | Returns                                                                 | Auth           |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :------------- |
| `initialize`     | `admin: Address, treasury: Address, fee_bps: u32`                                                                                                      | `Result<(), StreamError>`                                               | `admin`        |
| `set_fee`        | `fee_bps: u32`                                                                                                                                         | `Result<(), StreamError>`                                               | stored `admin` |
| `set_treasury`   | `treasury: Address`                                                                                                                                    | `Result<(), StreamError>`                                               | stored `admin` |
| `create_stream`  | `sender: Address, recipient: Address, token: Address, amount: i128, start_time: u64, end_time: u64, cliff_time: u64, label: String, reference: String` | `Result<u64, StreamError>` — the new stream id                          | `sender`       |
| `create_streams` | `sender: Address, token: Address, entries: Vec<(Address, i128, u64, u64, u64)>`                                                                        | `Result<Vec<u64>, StreamError>` — the new ids, in input order           | `sender`       |
| `withdraw`       | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — net amount paid after fee                 | `recipient`    |
| `cancel`         | `stream_id: u64`                                                                                                                                       | `Result<(), StreamError>`                                               | `sender`       |
| `claimable`      | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — vested minus already withdrawn, floor `0` | —              |
| `vested`         | `stream_id: u64`                                                                                                                                       | `Result<i128, StreamError>` — total vested so far                       | —              |
| `get_stream`     | `stream_id: u64`                                                                                                                                       | `Option<Stream>`                                                        | —              |
| `get_config`     | —                                                                                                                                                      | `Option<Config>` (`None` if uninitialized)                              | —              |
| `next_stream_id` | —                                                                                                                                                      | `u64` (`1` on a fresh deploy)                                           | —              |

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

### Batched creation

`create_streams` opens a whole payroll batch in one transaction. Each entry is
`(recipient, amount, start_time, cliff_time, end_time)` — `cliff_time` precedes
`end_time`, following the order in issue #184, which differs from
`create_stream`'s argument list. Batches carry no metadata: every stream stores
empty `label` and `reference` strings. `sender` funds every stream and
authorizes once for the whole batch; it is the same creator/funder as
`create_stream`'s `sender`, not the protocol `admin` stored by `initialize`.

The call is all-or-nothing. Every entry is validated with the same rules as
`create_stream` and the deposits are summed with checked arithmetic before the
first token transfer or storage write. One bad row returns its error (`1`–`3`)
with no streams created, no tokens moved and `next_stream_id` unchanged, so a
payroll can never be half paid out. Each stream pulls its own deposit, so the
contract's balance and every `total_amount` match N separate `create_stream`
calls.

`ids[i]` belongs to `entries[i]`: ids are allocated sequentially from
`next_stream_id` in input order and one `created` event is emitted per stream in
the same order. Empty batches return `EmptyBatch` (`13`) instead of burning a fee
on a no-op, and batches longer than `MAX_BATCH` return `BatchTooLarge` (`14`).

`MAX_BATCH` is `14`. A batch writes one stream entry and emits one
`StreamCreated` event per entry, so cost grows linearly: measured on mainnet
limits with soroban-env-host 27, a stream costs ~232k CPU instructions, ~33 KB of
memory, one ledger-entry write and 548 event bytes. The event budget (16,384
bytes per transaction) is the binding constraint, and `14` is the largest batch
whose events still fit in half of it (7,672 bytes), which keeps a 2× margin on
every limit and room for `StreamCreated` to grow. The
`test_create_streams_max_batch_fits_mainnet_limits` test measures a maximum-size
batch against the mainnet instruction, memory, write-entry, write-byte and
event-size limits. Larger payroll runs are split into multiple batches.

### Errors — `StreamError` (`#[repr(u32)]`)

| Code | Variant              | Produced when                                                                                                                                                                     |
| :--: | :------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  1   | `InvalidAmount`      | `create_stream`, or one `create_streams` entry, with `amount <= 0`.                                                                                                               |
|  2   | `InvalidTimeRange`   | `create_stream`, or one `create_streams` entry, with `end_time <= start_time`.                                                                                                    |
|  3   | `InvalidCliff`       | `create_stream`, or one `create_streams` entry, with `cliff_time < start_time` or `cliff_time > end_time`.                                                                        |
|  4   | `StreamNotFound`     | No stored stream under `stream_id` — raised by `withdraw`, `cancel`, `claimable`, `vested`. Also what a recipient sees if a persistent entry was archived after its TTL lapsed.   |
|  5   | `NothingToWithdraw`  | `withdraw` when `vested(now) - withdrawn <= 0` — before the cliff, at the start of a stream, after a full withdrawal, or for a stream whose vested amount is `0`.                 |
|  6   | `Unauthorized`       | `set_fee` or `set_treasury` called before `initialize` stored an admin. A wrong-signer call is not this code: `require_auth()` traps with a `Context` error before the body runs. |
|  7   | `InvalidFee`         | `fee_bps > 1000` (the 10 % cap) in `initialize` or `set_fee`.                                                                                                                     |
|  8   | `AlreadyCancelled`   | `cancel` on a stream whose `cancelled` flag is already set.                                                                                                                       |
|  9   | `AlreadyInitialized` | A second `initialize` call — the presence of `DataKey::Admin` is the guard.                                                                                                       |
|  10  | `TreasuryNotSet`     | `withdraw` when the fee is non-zero but no treasury address is stored.                                                                                                            |
|  11  | `MetadataTooLong`    | `create_stream` when `label.len() > 64` or `reference.len() > 128`. Checked with the other arguments, before any token moves.                                                     |
|  13  | `EmptyBatch`         | `create_streams` with no entries. Checked before validation, transfer or storage writes.                                                                                          |
|  14  | `BatchTooLarge`      | `create_streams` with more than `MAX_BATCH` (14) entries.                                                                                                                         |
|  15  | `BatchOverflow`      | `create_streams` whose deposits sum past `i128::MAX`, or whose id range would overflow `u64`. Checked before any token moves.                                                     |

Code `12` is deliberately unused: other in-flight changes had claimed it when the
batch variants were added, and existing codes must never shift. New variants
continue from `15`.

`STREAM_ERROR_CODES` in `packages/sdk/src/index.ts` is the one place these
numbers are named on the client side; codes outside that table fall back to the
raw diagnostics message rather than failing the call.

### Events

Each contract emits three topics — `(contract tag, action, id)` — with the `id`
as a `u64` in topic three. The remaining fields are the event _data_, emitted as
a **map keyed by field name** (the `#[contractevent]` struct's non-`#[topic]`
fields), not as a positional tuple, so decoding does not depend on field order.

| Topics                             | Data fields                                                                                   | Published by                                                      |
| :--------------------------------- | :-------------------------------------------------------------------------------------------- | :---------------------------------------------------------------- |
| `("stream", "created", id: u64)`   | `sender: Address`, `recipient: Address`, `amount: i128`, `label: String`, `reference: String` | `create_stream`, `create_streams` (one per entry, in input order) |
| `("stream", "withdrawn", id: u64)` | `recipient: Address`, `amount: i128`, `fee: i128`                                             | `withdraw`                                                        |
| `("stream", "cancelled", id: u64)` | `sender: Address`, `refunded: i128`                                                           | `cancel`                                                          |

The Rust event types are `StreamCreated`, `StreamWithdrawn` and
`StreamCancelled`; their field names are exactly the map keys above. `amount` on
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

Two-party payment with a third-party arbiter, keyed by a contract-assigned id,
with deadline-driven cancellation.

### Entry points

| Function         | Arguments                                                                                       | Returns                                        | Auth                                       |
| :--------------- | :---------------------------------------------------------------------------------------------- | :--------------------------------------------- | :----------------------------------------- |
| `create_escrow`  | `payer: Address, payee: Address, arbiter: Address, token: Address, amount: i128, deadline: u64` | `Result<u64, EscrowError>` — the new escrow id | `payer`                                    |
| `fund_escrow`    | `id: u64`                                                                                       | `Result<(), EscrowError>`                      | `payer`                                    |
| `release_escrow` | `id: u64, caller: Address`                                                                      | `Result<(), EscrowError>`                      | `caller`, who must be `payer` or `arbiter` |
| `refund_escrow`  | `id: u64, caller: Address`                                                                      | `Result<(), EscrowError>`                      | `caller`, who must be `payee` or `arbiter` |
| `cancel_escrow`  | `id: u64, caller: Address`                                                                      | `Result<(), EscrowError>`                      | `caller`, who must be `payer`              |
| `get_escrow`     | `id: u64`                                                                                       | `Option<Escrow>`                               | —                                          |
| `next_escrow_id` | —                                                                                               | `u64` (`1` on a fresh deploy)                  | —                                          |

```rust
struct Escrow {
    id: u64, payer: Address, payee: Address, arbiter: Address, token: Address,
    amount: i128, deadline: u64, status: EscrowStatus,
}

#[repr(u32)]
enum EscrowStatus { Created = 0, Funded = 1, Released = 2, Refunded = 3, Cancelled = 4 }
```

Ids are assigned by the contract from a `NextId` counter in instance storage,
exactly like `stream` and `splits`: the first escrow is `1`, and each successful
`create_escrow` increments the counter, stores the escrow under the new id and
returns it. `next_escrow_id` reports the id the next creation will receive
without changing anything, and every creation extends the instance entry that
holds the counter with the same `BUMP_THRESHOLD` / `BUMP_LIMIT` window used for
the escrow entries.

Because the contract issues the id, a creation can no longer collide with an
existing escrow. `EscrowAlreadyExists` (code `2`) was therefore removed; the
discriminant is retired rather than reused so every other error code keeps its
value.

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
|  3   | `InvalidAmount`          | `create_escrow` with `amount <= 0`. Checked before `payer`'s auth.                                                                                                                                                                                                                                                                                                                                                                            |
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
