---
'@stellar-starter-kit/sdk': minor
---

Add `StreamsClient.createStreams` for payroll-style batch creation. It mirrors
the contract's `create_streams(sender, token, entries)` call in a single
transaction, reuses the per-entry `createStream` validators, rejects empty or
oversized batches before simulating, and resolves with the contract-allocated
ids in input order plus the transaction hash.
