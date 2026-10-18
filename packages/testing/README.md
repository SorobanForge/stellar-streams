# @stellar-starter-kit/testing

Test-only helpers for code that talks to the Stellar Streams protocol — an
in-memory Soroban RPC transport, fixtures for `Stream` / `Escrow` / `Split`
values, and a harness that wires an SDK client to the fake transport.

This package is `private`, is not a dependency of `apps/web`, and is never
imported by shipped code, so it is never bundled into the app.

## What you get

- `createFakeTransport(options?)` — replaces `SorobanRpc.Server`'s five RPC methods with
  canned, in-memory answers.
- `createTestClient(factory, options?)` — builds clients with test-safe defaults on one shared
  transport, and returns `{ client, transport, withClient, restore }`.
- `streamFixture` / `escrowFixture` / `splitFixture` — domain values with every field set, plus
  `Partial` overrides.
- `streamScVal` — a `Stream` encoded the way the contract's `get_stream` returns it.
- `simulationSuccess` / `simulationError` — canned `simulateTransaction` responses.
- `sendResponse` / `txResponse` — canned `sendTransaction` / `getTransaction` responses.
- `trappedResult` / `badSequenceResult` — `TransactionResult`s for a trapped call and a stale
  sequence.
- `contractErrorEvent` — a diagnostic event carrying `Error(Contract, #code)`.
- `invokedCall` / `simulateByMethod` — decode which contract and method a transaction calls.
- `CONTRACT_ID` / `TOKEN_ID` / `PUBLIC_KEY` / `RECIPIENT` / `ARBITER` — stable contract ids and
  fixed-per-run keypairs.
- `NETWORK_PASSPHRASE` — the testnet passphrase the fakes pretend to use.

`createFakeTransport` answers with these defaults, all overridable through its
options: `getAccount` → sequence `100`, `simulateTransaction` → success with a
void return value, `prepareTransaction` → the transaction unchanged,
`sendTransaction` → `PENDING`, `getTransaction` → `SUCCESS` and hash `abc123`.
Every method stays a `vi.fn`, so a single call can still be overridden with
`mockResolvedValueOnce` / `mockRejectedValueOnce`.

## Example test

The SDK is the first consumer. A complete SDK-style test looks like this:

```ts
import { describe, expect, it } from 'vitest';
import { nativeToScVal } from '@stellar/stellar-sdk';
import {
  CONTRACT_ID,
  createTestClient,
  simulateByMethod,
  streamScVal,
} from '@stellar-starter-kit/testing';
import { StreamsClient } from '@stellar-starter-kit/sdk';

describe('getStream', () => {
  it('decodes a stream and its claimable balance', async () => {
    const { client, transport } = createTestClient((config) => new StreamsClient(config));

    transport.simulateTransaction.mockImplementation(
      simulateByMethod({
        get_stream: streamScVal({ label: 'Q4 payroll' }),
        claimable: nativeToScVal(250n, { type: 'i128' }),
      }),
    );

    const stream = await client.getStream(1);
    expect(stream).toMatchObject({
      id: '1',
      token: CONTRACT_ID,
      label: 'Q4 payroll',
    });
    await expect(client.claimable(1)).resolves.toBe(250n);
  });
});
```

`withClient` builds further clients against the same transport when a test needs
different client options:

```ts
const harness = createTestClient((config) => new StreamsClient(config));
const fast = harness.withClient({ pollIntervalMs: 1, pollTimeoutMs: 50 });
```

Call `harness.restore()` (or `vi.restoreAllMocks()` in `afterEach`) when the
test file is done so the real `SorobanRpc.Server` methods come back.

## Design notes

- `createTestClient` takes the client factory instead of importing
  `StreamsClient`, because the SDK's tests depend on this package; importing the
  SDK here would make the workspace dependency graph circular.
- `TestClientConfig` mirrors `StreamsClientOptions` field for field, so
  `new StreamsClient(config)` type-checks without a cast.
- The package expects `vitest` to be installed by the consuming package (every
  workspace package that has tests already ships it).
