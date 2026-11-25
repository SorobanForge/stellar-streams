# Contracts Documentation

Welcome to the Stellar Streams smart contracts documentation.

## Splits Contract

The splits contract allows users to configure immutable, reusable splits with proportional shares. Anyone can pay into a split, and funds are distributed on the spot. For more details on how rounding dust is handled, see the [Splits Rounding Worked Example](#splits-rounding-worked-example).

---

## Splits Rounding Worked Example

When distributing an amount that does not divide evenly among recipients using integer arithmetic, integer division leaves behind rounding dust (remainders). To ensure that no funds are stranded in the contract, the splits contract assigns any rounding dust to the final recipient.

This section provides a worked example demonstrating how integer math works per recipient, and how `recipient_share` and `distribute` agree.

### Scenario

- **Recipients:** 3 recipients with shares `[1, 1, 1]`
- **Total Shares:** $1 + 1 + 1 = 3$
- **Amount to Distribute:** `10` stroops (e.g., does not divide evenly by 3)

### Step-by-Step Integer Math per Recipient

The contract iterates through each recipient at index `i` and calculates their portion using integer division: `amount * share / total_shares`. For the final recipient, any previously distributed amount is subtracted from the total `amount` to capture all rounding dust.

1. **Recipient 0 (Share = 1):**
   - Formula: `10 * 1 / 3 = 3.333...`
   - Integer arithmetic: `10 * 1 / 3 = 3`
   - Amount distributed so far: `3`

2. **Recipient 1 (Share = 1):**
   - Formula: `10 * 1 / 3 = 3.333...`
   - Integer arithmetic: `10 * 1 / 3 = 3`
   - Amount distributed so far: `3 + 3 = 6`

3. **Recipient 2 (Final Recipient, Share = 1):**
   - Because this is the final recipient (`index == len - 1`), the contract assigns the remaining balance:
   - Formula: `amount - distributed`
   - Calculation: `10 - 6 = 4`

### Agreement Between `recipient_share` and `distribute`

Both `distribute` and `recipient_share` rely on the helper function `recipient_portion`, ensuring they produce identical results:

- `recipient_share(env, split_id, index=0, amount=10)` returns `3`
- `recipient_share(env, split_id, index=1, amount=10)` returns `3`
- `recipient_share(env, split_id, index=2, amount=10)` returns `4`

When `distribute` is called with `10` stroops, the exact same amounts `[3, 3, 4]` are transferred to Recipients 0, 1, and 2 respectively, summing to a total of `10` stroops with zero dust stranded.

---

# Stream Contract Documentation

This document describes the entry points, data structures, and operational semantics of the Stellar Streams contract.

## Overview

Contracts provide continuous, linear token streaming with support for cliffs, cancellations, milestones, and **pause/resume semantics**.

---

## Entry Points

- `create_stream(...)`: Initializes a new linear token stream.
- `withdraw(...)`: Withdraws currently vested funds.
- `cancel(...)`: Cancels an active stream and refunds unvested tokens.
- `pause(stream_id)`: Pauses an active stream. See [Pause and Resume Semantics](pause-resume.md).
- `resume(stream_id)`: Resumes a paused stream. See [Pause and Resume Semantics](pause-resume.md).
- `get_stream(stream_id)`: Returns the stream details.
- `claimable(stream_id)`: Returns the currently claimable balance.
- `vested(stream_id)`: Returns the total vested amount so far.

---

## Pause and Resume Semantics

Paused streams retain their `start_time` and `end_time` parameters, but subtract `total_paused` from the elapsed time calculation. Pausing extends the effective end date of the stream and shifts cliff calculations accordingly.

For full details, worked numerical examples, permissions, and error codes (`StreamAlreadyPaused`, `StreamNotPaused`), see **[docs/pause-resume.md](pause-resume.md)**.

---

## Milestone Streams

For details on milestone-based vesting, see [Milestone Vesting](milestone-vesting.md).