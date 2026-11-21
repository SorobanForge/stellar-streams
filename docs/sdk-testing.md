# Testing the SDK without a network

Every Soroban RPC call the SDK makes goes through one interface,
[`StreamsTransport`](../packages/sdk/src/index.ts), so a test can replace the
chain with an in-memory double instead of pointing a client at a public testnet
node. This guide is the copy-pasteable version of that: a fake transport, what
each of its seven methods has to return, and how to drive failover with two of
them.

The same seam is what the repo's own suite uses — see
[`packages/sdk/src/test-helpers.ts`](../packages/sdk/src/test-helpers.ts) for
the in-repo `FakeTransport`, which is the same idea with `vi.fn()` per method.
Everything below is standalone: paste it into your own project and it runs.

## Why a fake instead of a stubbed server

`StreamsClient` and `EscrowClient` reach RPC only through the transport they are
given (`transport` or `transportFactory` in
[`StreamsClientOptions`](../packages/sdk/src/index.ts)). Stubbing
`SorobanRpc.Server.prototype` leaves every un-stubbed call able to reach the
network; injecting an object that implements the interface makes an unplanned
call impossible to answer, so a test fails loudly instead of passing against
whatever the public node reported. An injected transport needs no RPC URL at
all, but the repo's own suite still passes `rpcUrl: 'https://rpc.invalid'`: if a
test ever falls back to the default server, the run fails on an unresolvable
host instead of quietly succeeding against a public node.

## The seven calls a fake must implement

`StreamsTransport` is exactly the surface a client can touch. Required per kind
of call:

| Method                    | Called by                                          | What your fake returns                                                                                                                          |
| :------------------------ | :------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAccount(address)`     | every read and write, for the source account       | `new Account(address, '1')` — the sequence number only matters to writes; reads never advance it.                                               |
| `simulateTransaction(tx)` | every read; every write unless `skipSimulation`    | a `SimulateTransactionResponse`: either `{ _parsed: true, result: { auth: [], retval } }` or `{ _parsed: true, error: 'Error(Contract, #4)' }`. |
| `prepareTransaction(tx)`  | the write pipeline, after the simulation           | the transaction it was handed, optionally with resource fees attached.                                                                          |
| `sendTransaction(tx)`     | the write pipeline                                 | `{ status: 'PENDING', hash: 'abc123', latestLedger: 1, latestLedgerCloseTime: 0 }`.                                                             |
| `getTransaction(hash)`    | the confirmation poll                              | `{ status: 'SUCCESS', hash, ledger: 1, ... }` — `ERROR`/`NOT_FOUND` make the write reject.                                                      |
| `getLatestLedger()`       | `listStreams`, to anchor its default ledger window | `{ id: 'ledger-hash', sequence: 5000, protocolVersion: '22' }`.                                                                                 |
| `getEvents(request)`      | `listStreams`, which pages through it              | `{ events, cursor, latestLedger, oldestLedger, oldestLedgerCursor, latestLedgerCursor }`; the `cursor` is fed back on the next page.            |

A read-only test therefore needs only `getAccount` and `simulateTransaction`; a
`listStreams` test additionally needs `getLatestLedger` and `getEvents`. The
client decodes simulated return values with `scValToNative`, so script an
`xdr.ScVal`, not a JavaScript object — `nativeToScVal(value, { type })` builds
one.

Simulation results are interpreted with `SorobanRpc.Api.isSimulationError`: any
response carrying an `error` string is treated as a failure, and an
`Error(Contract, #N)` suffix is mapped onto the client's typed error
(`StreamsError` / `EscrowError`) with its stable `code`. That is how you test an
on-chain rejection without an on-chain rejection.

## A fake transport you can paste

```ts
import { Account, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import type { FeeBumpTransaction, Transaction } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StreamsClient, type StreamsTransport } from '@stellar-starter-kit/sdk';

/**
 * An in-memory `StreamsTransport`. Reads are answered from `results`, keyed by
 * the contract method the simulated transaction invokes; anything not scripted
 * rejects, so an unexpected call is a test failure rather than a network trip.
 */
export class FakeTransport implements StreamsTransport {
  /** ScVals to answer simulations with, keyed by contract function name. */
  readonly results: Record<string, xdr.ScVal> = {};
  /** Contract error strings to answer simulations with, same keys. */
  readonly errors: Record<string, string> = {};
  /** Every contract call that reached this fake, in order. */
  readonly calls: string[] = [];
  /** Status reported by `sendTransaction`, then by the confirmation poll. */
  sendStatus: SorobanRpc.Api.SendTransactionStatus = 'PENDING';
  txStatus: SorobanRpc.Api.GetTransactionStatus = 'SUCCESS';

  async getAccount(address: string): Promise<Account> {
    return new Account(address, '1');
  }

  async simulateTransaction(tx: Transaction): Promise<SorobanRpc.Api.SimulateTransactionResponse> {
    const method = invokedMethod(tx);
    this.calls.push(method);
    const error = this.errors[method];
    if (error) return this.parsed({ error });
    const retval = this.results[method];
    if (!retval) throw new Error(`FakeTransport: ${method}() was not scripted.`);
    return this.parsed({ result: { auth: [], retval } });
  }

  async prepareTransaction(tx: Transaction): Promise<Transaction> {
    return tx;
  }

  async sendTransaction(
    tx: Transaction | FeeBumpTransaction,
  ): Promise<SorobanRpc.Api.SendTransactionResponse> {
    return {
      status: this.sendStatus,
      hash: 'fake-hash',
      latestLedger: 1,
      latestLedgerCloseTime: 0,
    };
  }

  async getTransaction(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse> {
    return {
      status: this.txStatus,
      hash,
      ledger: 1,
      latestLedger: 1,
      createdAt: '2026-01-01T00:00:00Z',
      _embedded: { records: [] },
    } as unknown as SorobanRpc.Api.GetTransactionResponse;
  }

  async getLatestLedger(): Promise<SorobanRpc.Api.GetLatestLedgerResponse> {
    return { id: 'fake-ledger', sequence: 5_000, protocolVersion: '22' };
  }

  async getEvents(): Promise<SorobanRpc.Api.GetEventsResponse> {
    return {
      events: [],
      cursor: '5000-0',
      latestLedger: 5_000,
      oldestLedger: 1,
      oldestLedgerCursor: '1-0',
      latestLedgerCursor: '5000-0',
    };
  }

  /** `_parsed: true` is what makes the SDK treat the object as an RPC reply. */
  private parsed(extra: Record<string, unknown>): SorobanRpc.Api.SimulateTransactionResponse {
    return {
      id: 'fake',
      latestLedger: 5_000,
      events: [],
      minResourceFee: '0',
      transactionData: undefined,
      _parsed: true,
      ...extra,
    } as unknown as SorobanRpc.Api.SimulateTransactionResponse;
  }
}

/** The contract function a built transaction's first operation calls. */
function invokedMethod(tx: unknown): string {
  const op = (tx as { operations: Array<{ func?: xdr.HostFunction }> }).operations[0];
  return op!.func!.invokeContract().functionName().toString();
}
```

## Running a client against it

```ts
// Both ids are ordinary strkeys the SDK validates on construction, so they have
// to be well formed even in an example that never reaches a network.
const CONTRACT_ID = 'CAGJZYKBJYGG7C4W4XL2H6GA2HRLHJEVQZ3WQWSLHQWR4D42RN6G2AUE';
const PASSPHRASE = 'Test SDF Network ; September 2015';
const ACCOUNT_ID = 'GA74Q5R5IOP2KABENPWK2DJ76HZH2JS4YXZX3JBH5VNKGMPXQX5ZWNM6';

const fake = new FakeTransport();
fake.results['get_stream'] = nativeToScVal(
  {
    id: 12n,
    sender: ACCOUNT_ID,
    recipient: ACCOUNT_ID,
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    total_amount: 1_000_000_000n,
    withdrawn: 0n,
    start_time: 1_000n,
    end_time: 2_000n,
    cliff_time: 1_500n,
    cancelled: false,
    label: '',
    reference: '',
  },
  {
    type: {
      id: ['symbol', 'u64'],
      sender: ['symbol', 'address'],
      recipient: ['symbol', 'address'],
      token: ['symbol', 'address'],
      total_amount: ['symbol', 'i128'],
      withdrawn: ['symbol', 'i128'],
      start_time: ['symbol', 'u64'],
      end_time: ['symbol', 'u64'],
      cliff_time: ['symbol', 'u64'],
      cancelled: ['symbol', 'boolean'],
      label: ['symbol', 'string'],
      reference: ['symbol', 'string'],
    },
  },
);
fake.results['claimable'] = nativeToScVal(250_000_000n, { type: 'i128' });

const client = new StreamsClient({
  contractId: CONTRACT_ID,
  networkPassphrase: PASSPHRASE,
  rpcUrl: 'https://rpc.invalid',
  publicKey: ACCOUNT_ID,
  transport: fake,
});

const stream = await client.getStream(12);
const claimable = await client.claimable(12);

// `u64`/`i128` fields decode to decimal strings on the stream, and `claimable`
// returns a bigint.
console.log(stream?.totalAmount, claimable); // '1000000000' 250000000n
console.log(fake.calls); // [ 'get_stream', 'claimable' ]
```

`transport` accepts a single fake or an array of them (one per configured
`rpcUrls` entry), so nothing about the client's own behaviour changes.

Scripting a contract rejection is the same idea through `errors`. Writes need a
`signTransaction` to be configured, but a simulated failure is discovered before
the client ever asks for a signature, so the fake below is never asked to sign
anything:

```ts
const fake = new FakeTransport();
fake.errors['withdraw'] = 'Error(Contract, #5)';

const client = new StreamsClient({
  contractId: CONTRACT_ID,
  networkPassphrase: PASSPHRASE,
  rpcUrl: 'https://rpc.invalid',
  publicKey: ACCOUNT_ID,
  signTransaction: async (xdr) => xdr,
  transport: fake,
});

// Code 5 is NOTHING_TO_WITHDRAW in the SDK's stream error map.
await expect(client.withdraw(12)).rejects.toMatchObject({ code: 'NOTHING_TO_WITHDRAW' });
```

## Testing failover with `transportFactory`

`transportFactory` is called once per configured RPC URL and is how a test builds
two different fakes without touching the client's internals:

```ts
const PRIMARY = 'https://primary.example';
const SECONDARY = 'https://secondary.example';

const primary = new FakeTransport();
const secondary = new FakeTransport();
secondary.results['claimable'] = nativeToScVal(1n, { type: 'i128' });

// A connection-level failure, shaped the way axios and fetch report one. The
// client only rotates on these: a contract error must never be hidden by
// trying another host.
primary.getAccount = async () => {
  throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
    code: 'ECONNREFUSED',
  });
};

const rotations: Array<{ from: string; to: string }> = [];
const client = new StreamsClient({
  contractId: CONTRACT_ID,
  networkPassphrase: PASSPHRASE,
  rpcUrls: [PRIMARY, SECONDARY],
  publicKey: ACCOUNT_ID,
  transportFactory: (url) => (url === PRIMARY ? primary : secondary),
  onRpcFailover: (event) => rotations.push({ from: event.from, to: event.to }),
});

await client.claimable(12); // the read itself succeeds

console.log(client.activeRpcUrl); // 'https://secondary.example'
console.log(rotations); // [ { from: 'https://primary.example', to: 'https://secondary.example' } ]
```

Three things worth asserting in a failover test:

- **The rotation happened and then stuck.** `activeRpcUrl` reports the host now
  in use, and the next call must not go back to the failed one.
- **Which host each call reached.** Give each fake its own scripted answers so a
  read that lands on the wrong host fails, rather than passing silently.
- **Application errors do not rotate.** Script `errors['claimable']` on the
  primary instead of a connection failure and assert the client rejects with
  `StreamsError` while `activeRpcUrl` is still the primary.

## Running it in this repo

Inside the monorepo the same patterns are already wired up; run the suite with:

```bash
pnpm --filter @stellar-starter-kit/sdk test
```

The suite in `packages/sdk/src/*.test.ts` uses
`fakeTransport()` / `simulateByMethod()` from
[`src/test-helpers.ts`](../packages/sdk/src/test-helpers.ts), which is the
`vi.fn()`-per-method version of the class above, and
[`src/rpc-fixtures.test.ts`](../packages/sdk/src/rpc-fixtures.test.ts) replays
recorded public RPC responses from `test/fixtures/rpc/` — run
`pnpm --filter @stellar-starter-kit/sdk run fixtures:record` to refresh those
after changing a scenario list.

- Back to the [SDK guide](sdk.md).
- Contract-side behaviour: [Contract Reference](contracts.md).
