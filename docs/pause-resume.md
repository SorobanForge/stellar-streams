# Stream Pause and Resume Semantics

Issue #381 defines the exact behavior when streams are paused and resumed. This document explains how `paused_at`, `total_paused`, elapsed time, cliff behavior, and effective end dates work, along with a worked numerical example and error codes.

## Core Concepts

- **`paused_at`**: A `Option<u64>` timestamp recording when the stream was last paused. If the stream is active (not paused), `paused_at` is `None`.
- **`total_paused`**: A `u64` cumulative duration (in seconds) that the stream has spent in the paused state across all pause/resume cycles.

### Elapsed Time Formula

When calculating the vestable amount or progress, the active elapsed time is computed as:

$$\text{Active Elapsed} = (\text{current\_time} - \text{start\_time}) - \text{total\_paused}$$

If the stream is currently paused (`paused_at` is `Some(pause_time)`), the clock is effectively frozen at `pause_time`. Any time passing between `pause_time` and `resume_time` does not contribute to vesting.

## Effect on Cliff and Effective End Date

- **Cliff Behaviour**: If a stream is paused _before_ the cliff is reached, the cliff timestamp is effectively shifted forward by the total duration of the pause. The cliff blocks vesting until `\text{Active Elapsed} \ge \text{cliff\_duration}$$.
- **Effective End Date**: Pausing a stream extends its life. The effective end date is pushed out by the exact duration of the pause:

  $$\text{Effective End Time} = \text{end\_time} + \text{total\_paused}$$ (or plus the current pause duration if actively paused).

This ensures that the recipient still receives the full duration of active vesting time originally intended.

## Permissions and Authorization

- **Who may pause / resume**: Only the stream **sender** (or an authorized administrative role depending on the specific integration) may invoke `pause` and `resume` entry points. The recipient cannot pause or resume the stream.
- **Error Codes**:
  - `StreamAlreadyPaused` (Error Code 15): Attempting to pause a stream that is already paused.
  - `StreamNotPaused` (Error Code 16): Attempting to resume a stream that is not currently paused.
  - `Unauthorized` (Error Code 4): Attempting to pause or resume a stream as an unauthorized caller.
  - `AlreadyCancelled` (Error Code 8): Attempting to pause or resume a stream that has already been cancelled.

---

## Worked Vesting Example

Let's trace a linear stream with the following parameters:

- **Start Time**: `t = 100`
- **End Time**: `t = 500` (Total duration: 400 seconds)
- **Total Amount**: `1,000` tokens ($2.5$ tokens per active second)
- **Cliff Time**: `t = 200`

### Timeline of Events:

1. **`t = 150`**: Stream is active.
   - Elapsed active time: $150 - 100 = 50$ seconds.
   - Vested amount: $0$ (cliff at 200 has not been reached).

2. **`t = 250`**: Stream is paused (`paused_at = Some(250)`).
   - Prior to pause, active time from start was $250 - 100 = 150$ seconds.
   - Since cliff ($200$) was passed, tokens vested: $(200 - 100 \text{ pre-cliff wait} \dots)$ wait, active time is $150$ seconds. From $t=200$ to $250$ is $50$ active seconds $\times 2.5 = 125$ tokens vested.
   - `total_paused` is currently $0$.

3. **`t = 350`**: Stream is resumed (`resume`).
   - Duration of pause: $350 - 250 = 100$ seconds.
   - `total_paused` becomes $0 + 100 = 100$ seconds.
   - `paused_at` becomes `None`.
   - Effective end time is pushed from $500$ to $500 + 100 = 600$.

4. **`t = 450`**: Current time check.
   - Current wall-clock time: $450$.
   - Total wall-clock elapsed: $450 - 100 = 350$.
   - Minus `total_paused` ($100$): Active elapsed time = $350 - 100 = 250$ seconds.
   - Vested amount: $250 \text{ active seconds} \times 2.5 \text{ tokens/sec} = 625$ tokens.
