# Milestone-based (non-linear) vesting

Issue #81 adds an opt-in milestone schedule to the `stream` contract: instead
of vesting a locked amount linearly between `start_time` and `end_time`, the
funds are split into fixed **tranches** that vest only when the payer (or a
designated arbiter) marks the corresponding milestone complete. Grants and
bounties are the motivating use cases: payment should follow delivered work,
not wall-clock time.

> **Status: design note, not implemented on this branch.** This document ships in
> #247 so the design is reviewable before the feature PR that issue #81 deserves;
> the entry points below (`create_milestones`, `release_milestones`,
> `cancel_milestones`, `get_milestones`) and their tests are deliberately kept off
> this test/perf branch. The `StreamError` numbers quoted are the next free values
> after `AmountOverflow = 19` as `contracts/stream/src/lib.rs` stands today.

The linear path is untouched. `create_stream`, `withdraw`, `cancel`,
`claimable` and `vested` behave exactly as before, and all pre-existing
tests pass unchanged. Milestones are a parallel set of entry points
(`create_milestones`, `release_milestones`, `cancel_milestones`,
`get_milestones`) reusing the same `Stream` record and withdrawal machinery.

## Design

### Tranche storage

A milestone stream reuses the existing `DataKey::Stream(id)` entry and adds a
companion `DataKey::Milestones(id)` entry:

```text
MilestoneSet {
    arbiter:  Option<Address>,   // optional second releaser
    tranches: Vec<Tranche>,      // Tranche { amount: i128, released: bool }
}
```

- The full sum of all tranches is transferred into the contract at creation,
  exactly like a linear stream, so custody exists from block one.
- Tranches live in a single bounded `Vec` (max `MAX_TRANCHES = 32`), kept in
  one persistent ledger entry so releases cost one read and one write, and
  rent stays predictable regardless of schedule size.
- The `Stream` record stays the single source of truth for payouts. Its
  schedule is stored in a degenerate "fully vested at `now`" form
  (`start_time == cliff_time == end_time == now`) and `total_amount` is grown
  only when a tranche is released. Consequently
  `vested_amount == total_amount == released sum` at all times: nothing ever
  vests by the clock, and `withdraw` needs no milestone-specific logic.

### Who may release

`release_milestones(stream_id, index, caller)` authorizes `caller` (an
explicit address so the contract stays callable through future proxy
patterns). The sender may always release; an `arbiter` set at creation may
also release. Nobody else can — in particular the recipient cannot release
their own tranches (`Unauthorized`). With `arbiter: None` the sender is the
sole releaser.

Release rules, each with its own typed error (`StreamError`):

| Rule                                                       | Error                           |
| ---------------------------------------------------------- | ------------------------------- |
| index beyond the schedule                                  | `MilestoneNotFound` (20)        |
| release an already-released tranche (over-release)         | `MilestoneAlreadyReleased` (21) |
| release tranche `i` while some tranche `< i` is unreleased | `MilestoneOutOfOrder` (22)      |
| empty / non-positive / over-capacity schedule at creation  | `InvalidMilestones` (23)        |
| milestone operations against a linear stream               | `NotMilestoneStream` (24)       |
| release after cancellation                                 | `AlreadyCancelled` (8)          |

Enforcing strictly in-order release keeps the semantics trivial to audit: the
released prefix is always exactly "the first `k` tranches" for some `k`, so
`total_amount` (vested) is a prefix sum and partial-middle releases cannot
create accounting branches.

### Interaction with cancel

Milestone streams must not use the linear `cancel`: it would compute the
refund from `total_amount`, which only tracks released tranches, and strand
every unreleased token in the contract. `cancel` therefore detects the
presence of a `Milestones` entry and fails with `UseMilestoneCancel` (25).

`cancel_milestones(stream_id)` (sender-only) instead:

- refunds the sum of all **unreleased** tranches to the sender immediately;
- leaves released tranches vested — the recipient can still `withdraw` them,
  identical to a linear cancellation compressing the vested remainder;
- marks the stream `cancelled`, so further releases fail with
  `AlreadyCancelled` and a second cancel fails the same way;
- never touches more than the locked custody: refund plus already-withdrawn
  plus still-held released tranches always sum back to the original deposit
  (the follow-up PR's tests must assert this; no such test exists yet).

Cancelling before any release refunds the entire deposit and leaves nothing
claimable; cancelling after every release refunds zero and is equivalent to
letting the recipient withdraw everything.

### Views

`claimable`, `vested`, `vesting_summary` and `get_stream` work for both kinds
of streams without changes, since milestone streams express their state
through the same `Stream` record. `get_milestones(id)` returns the schedule
(`None` for linear streams) so UIs can render tranche progress.

### Events

- `MilestoneStreamCreated { id, sender, recipient, amount, tranche_count }`
- `MilestoneReleased { id, index, caller, amount }`
- `cancel_milestones` reuses the existing `StreamCancelled { id, sender, refunded }`
  event so consumers watching linear cancellations also see milestone ones.

## Out of scope

- Per-tranche deadlines and time-based fallbacks (e.g. "tranche 2 unlocks
  after date X") — can be layered on top of the current design by gating
  `release_milestones` calls.
- Multi-signature or threshold release; the single optional `arbiter` covers
  the common two-of-two case and can be replaced by a signer-set contract
  address passed as `arbiter`.
