---
'@stellar-starter-kit/sdk': minor
---

Add `StreamsClient.pause(id, opts?)` and `StreamsClient.resume(id, opts?)`, which call the stream contract's `pause` and `resume` methods with the full `WriteOptions` support every other write has. Add `StreamsClient.getVestingSummary(id)`, which reads `{ vested, claimable }` as `bigint` amounts in a single `vesting_summary` call. `StreamsError.code` now also names contract errors `#16` (`STREAM_PAUSED`) and `#17` (`NOT_PAUSED`).
