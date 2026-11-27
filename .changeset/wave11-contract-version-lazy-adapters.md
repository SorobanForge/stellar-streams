---
'@stellar-starter-kit/sdk': minor
'@stellar-starter-kit/wallets': minor
---

Read the contract interface version, and load each wallet only when it is used

`StreamsClient` and `EscrowClient` now expose `getVersion()`, which returns the `u32` reported by
the deployed contract, alongside the exported `SUPPORTED_CONTRACT_VERSION` this build is written
against and `describeVersionMismatch()`, which turns the pair into a sentence to show a user.

The wallet connector loads an adapter with `import()` the first time that provider is used, so
mounting `WalletProvider` no longer pulls Freighter's and Albedo's client SDKs into the initial
chunk of every page that renders it.
