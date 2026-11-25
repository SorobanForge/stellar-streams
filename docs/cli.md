# `streams` CLI

`packages/cli` ships the `streams` executable for scripting the `stream`
contract without the dashboard. It is a plain Node 20+ program: argument
parsing uses `node:util`'s `parseArgs`, and all chain access goes through
`@stellar-starter-kit/sdk`, so the CLI adds no framework dependency of its own.

## Build and run

```bash
pnpm install
pnpm --filter @stellar-starter-kit/cli build

# Run the built bin, or link it globally
node packages/cli/dist/bin.js --help
pnpm --filter @stellar-starter-kit/cli link --global
streams --help
```

During development, `pnpm --filter @stellar-starter-kit/cli dev -- --help` runs
the TypeScript entry point with `tsx` (build the SDK first if its `dist/` is
stale).

## Configuration

| Setting     | Flag            | Environment variable                       |
| :---------- | :-------------- | :----------------------------------------- |
| Network     | `--network`     | — (defaults to `testnet`)                  |
| Contract id | `--contract-id` | `STREAMS_CONTRACT_ID`                      |
| Signing key | `--secret-key`  | `STREAMS_SECRET_KEY`, `STELLAR_SECRET_KEY` |

The network name must be one of `local`, `testnet`, or `mainnet`, and its RPC
URL and passphrase come from the shared `KNOWN_NETWORKS` constants in
`@stellar-starter-kit/config` — the same registry the SDK and dashboard use.
Prefer the environment variable for the signing key so it does not land in shell
history.

The signer is a Stellar secret seed (`S...`). The CLI derives the sender address
from it and signs locally; it never prints the key.

## Commands

### Create

```bash
export STREAMS_CONTRACT_ID=C...
export STREAMS_SECRET_KEY=S...

streams create \
  --recipient G... \
  --amount 10000000 \
  --start 1767225600 \
  --end 1798761600 \
  --cliff 1767225600 \
  --label "Payroll Q1" \
  --reference "INV-2026-07"
```

`--amount` is in the token's smallest unit, not whole tokens. `--start`,
`--end`, and `--cliff` accept unix seconds or ISO 8601 timestamps; `--start`
defaults to now and `--cliff` defaults to the start time. `--token` defaults to
the network's native XLM Stellar Asset Contract.

### Show

```bash
streams show 12 --network testnet
```

Prints the stream record as JSON with `bigint` values as decimal strings.

### Withdraw

```bash
streams withdraw 12
```

Withdraws everything currently claimable. Only the recipient can authorize it.

## Dry run

Add `--dry-run` to `create` or `withdraw` to simulate against the selected
network without signing or submitting. The CLI prints the assembled transaction
XDR plus the minimum resource fee and simulated CPU/memory cost, which is
exactly what the SDK returns from `simulateOnly`.

```bash
streams withdraw 12 --dry-run
```

To verify a dry run against a local node, start one with `pnpm node:local` and
pass `--network local`; the RPC URL then resolves to
`http://localhost:8000/soroban/rpc`.
