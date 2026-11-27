---
'@stellar-starter-kit/wallets': minor
---

Add a read-only `WatchAdapter` (`WALLET_PROVIDERS.WATCH`) for inspecting an
address without a wallet extension. It validates a pasted `G...`/`C...` StrKey,
reports availability without `window`, returns the address from `connect()`,
and rejects `signTransaction`/`signAuthEntry` with `NotSupportedError`.

`WalletCapabilities` gains a `readOnly` flag (exposed as `readOnly` on
`useWallet()`) so UIs can disable write buttons before a signing attempt, and
`connect(provider, address?)` now forwards the address for the watch flow.
