---
'@stellar-starter-kit/hooks': minor
'@stellar-starter-kit/sdk': patch
---

Add partial-cancellation and escrow write hooks, and name the contract error
codes they expose.

- `useReduceStream` submits `reduce_stream`, refuses a negative total locally,
  updates every mounted `useStream` optimistically, and refetches on success.
- `useCreateEscrow`, `useFundEscrow`, `useReleaseEscrow`, `useRefundEscrow` and
  `useCancelEscrow` share one write helper, so pending/success/error and
  unmount handling match the stream hooks.
- Mutation state now carries `errorCode` (from `EscrowError.code` /
  `StreamsError.code`) so a UI can branch on the contract outcome.
- The SDK error tables now match the contracts: `ReductionBelowVested` and
  `InvalidReduction` are named, `SAME_RECIPIENT` is 22, and the escrow
  deadline/milestone codes are decoded.
- The streams dashboard formats amounts through a tested helper that uses the
  token's own decimals and symbol, falling back to the raw base-unit value when
  the metadata read fails.
