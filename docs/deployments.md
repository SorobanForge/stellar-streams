# Deployments

Contract ids per network. `apps/web/src/generated/deployments.json` is the source of truth
written by `pnpm deploy:testnet`; this page is the human-readable mirror.

> Fill this in immediately after a deployment and before submitting to Drips Wave. A submission
> without on-chain links reads as unfinished.

## Testnet

Deployed: _TBD_ (run `pnpm build:contracts && pnpm optimize && pnpm deploy:testnet`)

| Contract | Contract id | Explorer |
| :------- | :---------- | :------- |
| `stream` | _TBD_       | _TBD_    |
| `splits` | _TBD_       | _TBD_    |
| `escrow` | _TBD_       | _TBD_    |

Network passphrase: `Test SDF Network ; September 2015`
Soroban RPC: `https://soroban-testnet.stellar.org`

## Mainnet

Not deployed. The contracts are unaudited; see [SECURITY.md](../SECURITY.md).

## Administration

For instructions on updating protocol fees and treasury addresses securely, see the [Admin Runbook](admin-runbook.md).

## How to regenerate this page

1. Deploy: `pnpm build:contracts && pnpm optimize && pnpm deploy:testnet`.
2. Copy the ids from the deploy summary block (or from
   `apps/web/src/generated/deployments.json`).
3. Add a row per contract with `https://stellar.expert/explorer/testnet/contract/<ID>`.
