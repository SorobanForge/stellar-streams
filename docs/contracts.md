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
