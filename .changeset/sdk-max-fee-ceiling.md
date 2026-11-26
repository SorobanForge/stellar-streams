---
'@stellar-starter-kit/sdk': minor
---

Add a configurable fee ceiling. `StreamsClientOptions.maxFee` applies to every
write, and `WriteOptions.maxFee` overrides it per call; the stricter (lower)
value wins. A fee above the ceiling throws before the transaction is built or a
wallet prompt is opened, with both values named in the message. Fee-bump
submissions check the inner transaction fee and the outer sponsor rate against
the same ceiling.
