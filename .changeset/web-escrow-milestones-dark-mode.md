---
'@stellar-starter-kit/sdk': minor
'@stellar-starter-kit/types': minor
'@stellar-starter-kit/ui': patch
---

Add escrow milestone support to the SDK and types: `EscrowClient.setMilestones`,
`getMilestones`, `getRemainingAmount` and `createMilestoneEscrow`, plus
`CreateEscrowParams` dropping the caller-supplied id the contract no longer
accepts. `@stellar-starter-kit/types` gains `getEscrowTotals` and `EscrowTotals`
for the live remaining/refundable projection. The shared UI primitives, header
and footer now use light/dark tokens, and the header accepts theme-toggle
actions, so the dashboard can ship a persisted dark mode.
