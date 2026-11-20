---
'@stellar-starter-kit/sdk': minor
---

Add `StreamsClient.topUp(id, amount, opts?)` and
`reduceStream(id, newTotal, opts?)`, exposing the contract's `top_up` and
`reduce_stream` writes. Amounts must be positive decimal integer strings (or
`bigint`s), are validated before a wallet prompt opens, and are encoded as
`i128`. Contract failures now map to `StreamsError.code` values
`AMOUNT_OVERFLOW`, `REDUCTION_BELOW_VESTED` and `INVALID_REDUCTION`; the
`SAME_RECIPIENT` mapping is corrected from code 20 to the contract's code 22.
