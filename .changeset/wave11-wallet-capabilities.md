---
'@stellar-starter-kit/wallets': minor
---

Export `WALLET_CAPABILITIES` (and `getWalletCapabilities`), a data matrix of
`signAuthEntry`, `hardware` and `deepLink` per adapter, asserted against the
adapters by a test. `WalletProvider` exposes the active wallet's entry as
`capabilities` on its context value, so a UI can hide a flow the wallet cannot
sign instead of failing at call time.
