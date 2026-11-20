---
'@stellar-starter-kit/types': minor
'@stellar-starter-kit/sdk': minor
---

`CreateStreamParams.amount` now accepts `string | bigint`. Callers holding a
`bigint` from a claimable/vested read can pass it to `createStream` directly;
the SDK stringifies it before validation, so string callers and the existing
error messages are unchanged. Amounts outside the `i128` range are rejected
with the field-named `Invalid amount` error before a transaction is built.
