# Adding a wallet adapter

Every Stellar wallet that the dashboard supports lives behind one small
interface, [`WalletAdapter`](../packages/wallets/src/adapters/adapter.ts). Pages
never import a wallet SDK: they call `useWallet()` and the provider routes the
call to the active adapter. Adding a wallet therefore means writing one adapter
module and registering it — not touching the pages.

This guide walks through implementing the interface from scratch, wiring the
adapter into the registry, and testing it with the shared wallet mock.

## The contract

An adapter is a class implementing six required members and two optional ones:

| Member                            | Required | Responsibility                                                                |
| :-------------------------------- | :------- | :---------------------------------------------------------------------------- |
| `id: WalletType`                  | Yes      | Provider id, matched against the persisted session and the capability matrix. |
| `name: string`                    | Yes      | Human-readable name used in errors.                                           |
| `isAvailable(): Promise<boolean>` | Yes      | Whether the extension or device is installed and reachable. Must not throw.   |
| `connect(): Promise<string>`      | Yes      | Open the wallet and resolve with the public key (`G...`).                     |
| `getPublicKey(): Promise<string>` | Yes      | Ask the wallet for its current key; never serve a stale cached one.           |
| `signTransaction(xdr, opts?)`     | Yes      | Sign an envelope XDR and resolve with the signed envelope XDR.                |
| `signAuthEntry(entryXdr, opts?)`  | No       | Sign a Soroban authorization entry. Omit it when the wallet SDK cannot.       |
| `disconnect(): Promise<void>`     | No       | End the extension session or close the device transport.                      |

Signing methods receive the caller's network options. Use
`resolveNetworkPassphrase(opts)` from `adapter.ts` when the SDK wants a
passphrase; it falls back to Testnet when no network is named.

`getPublicKey()` is deliberately not cached-only: `WalletProvider` calls it on
mount to verify a persisted session, so it has to report the account the wallet
holds _now_, not the one that was connected last.

### Rejection vs. cancellation vs. failure

The three outcomes are different, and the UI treats them differently:

- **Rejection** — the user saw the request and declined it. Throw
  `WalletRejectedError` (code `WALLET_REJECTED`). Do not retry automatically.
- **Cancellation** — the prompt was dismissed, closed, or aborted before the
  user decided. Throw `WalletCancelledError` (code `WALLET_CANCELLED`). A retry
  is safe to offer.
- **Failure** — anything else (locked device, simulation error, network
  problem). Throw a plain `Error`, keeping the wallet's message and attaching
  the original error as `cause`.

Rules that keep those distinctions intact:

- **Never return an empty string or an unsigned XDR on failure.** A falsy
  signature looks like a successful signature to every caller.
- **Preserve the wallet's message** when you map an error, and pass
  `{ cause: err }` so the original payload survives for debugging.
- **Classify only what you can prove.** A string containing `reject` or `denied`
  is a rejection; `cancel`, `closed`, `dismiss`, or `abort` is a cancellation;
  everything else stays a plain `Error`. See
  [`toRabetSigningError`](../packages/wallets/src/adapters/rabe.ts) for a
  complete implementation.
- **Omit `signAuthEntry` when unsupported.** `WalletProvider.signAuthEntry`
  raises `NotSupportedError` with the correct message; implementing a stub that
  throws your own error bypasses that contract.
- **Let the provider log.** Adapters throw; `WalletProvider` logs rejections at
  `warn` and real failures at `error`. Logging again in the adapter duplicates
  the entry.

## Complete example

The example below wraps a fictional injected extension, Acme Wallet, whose
provider exposes `window.acme`. Copy it to
`packages/wallets/src/adapters/acme.ts` and change the provider calls to match
the real SDK.

```ts
import type { SignTransactionOptions, WalletAdapter } from './adapter.js';
import type { WalletType } from '../WalletProvider.js';
import { WalletCancelledError, WalletRejectedError } from '../errors.js';

/** The subset of the Acme extension API this adapter relies on. */
interface AcmeProvider {
  connect(): Promise<{ publicKey: string }>;
  signTransaction(xdr: string, opts: { network: string }): Promise<{ signedXdr: string }>;
  disconnect?(): Promise<void>;
}

declare global {
  interface Window {
    acme?: AcmeProvider;
  }
}

/** Reads the injected provider, or explains why it is missing. */
function acmeProvider(): AcmeProvider {
  const acme = window.acme;
  if (!acme) {
    throw new Error('Acme wallet extension is not installed.');
  }
  return acme;
}

/** Maps Acme's untyped rejection payload onto the package's typed errors. */
function toAcmeSigningError(err: unknown): Error {
  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Failed to sign transaction.';

  const normalized = message.toLowerCase();
  if (normalized.includes('reject') || normalized.includes('denied')) {
    return new WalletRejectedError(message, { cause: err });
  }
  if (
    normalized.includes('cancel') ||
    normalized.includes('closed') ||
    normalized.includes('dismiss') ||
    normalized.includes('abort')
  ) {
    return new WalletCancelledError(message, { cause: err });
  }
  return new Error(message, { cause: err });
}

/** Adapter for the Acme wallet extension (`window.acme`). */
export class AcmeAdapter implements WalletAdapter {
  readonly id: WalletType = 'acme';
  readonly name = 'Acme';

  private publicKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    // Return false rather than throwing: session restore treats a throw as
    // "no wallet" but a clear boolean is the documented contract.
    return typeof window.acme !== 'undefined';
  }

  async connect(): Promise<string> {
    const res = await acmeProvider().connect();
    if (!res.publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = res.publicKey;
    return res.publicKey;
  }

  async getPublicKey(): Promise<string> {
    // Ask again so restore notices an account switch, then cache for signing.
    const res = await acmeProvider().connect();
    if (!res.publicKey) {
      throw new Error('Failed to retrieve public key from wallet.');
    }
    this.publicKey = res.publicKey;
    return res.publicKey;
  }

  async signTransaction(xdr: string, opts?: SignTransactionOptions): Promise<string> {
    const network = (opts?.network ?? 'TESTNET').toLowerCase();
    try {
      const { signedXdr } = await acmeProvider().signTransaction(xdr, { network });
      if (!signedXdr) {
        throw new Error('Failed to sign transaction.');
      }
      return signedXdr;
    } catch (err) {
      throw toAcmeSigningError(err);
    }
  }

  async disconnect(): Promise<void> {
    // Clear the cached key even if the extension is gone, so a later connect
    // cannot sign with a stale account.
    this.publicKey = null;
    await window.acme?.disconnect?.();
  }
}
```

If the wallet's SDK is a package rather than an injected global, import it
lazily inside each method (as the Freighter and Albedo adapters do) so its code
stays in a separate chunk until the wallet is selected. Hardware wallets take
their transport and app binding through constructor options instead; see
[`LedgerAdapter`](../packages/wallets/src/adapters/ledger.ts).

## Registering the adapter

Four edits wire the new module into the provider and the published capability
matrix:

1. **Extend `WalletType`** in
   [`WalletProvider.tsx`](../packages/wallets/src/WalletProvider.tsx):

   ```ts
   export type WalletType = 'freighter' | 'albedo' | 'rabe' | 'hana' | 'ledger' | 'acme';
   ```

2. **Add a lazy loader** to `ADAPTER_LOADERS` in the same file, so the adapter
   and its SDK are only downloaded when that wallet is chosen:

   ```ts
   acme: async () => new (await import('./adapters/acme.js')).AcmeAdapter(),
   ```

3. **Add the capability entry** in
   [`capabilities.ts`](../packages/wallets/src/capabilities.ts). The map is
   typed as `Record<WalletType, WalletCapabilities>`, so the compiler rejects a
   wallet that is registered but missing here:

   ```ts
   acme: {
     wallet: 'acme',
     name: 'Acme',
     signAuthEntry: false,
     hardware: false,
     deepLink: false,
   },
   ```

   `capabilities.test.ts` asserts the matrix against the adapters, so an
   incorrect `signAuthEntry` value fails the suite.

4. **Export the adapter** from
   [`adapters/index.ts`](../packages/wallets/src/adapters/index.ts):

   ```ts
   export { AcmeAdapter } from './acme.js';
   ```

Then add the wallet to the tables in
[`packages/wallets/README.md`](../packages/wallets/README.md) so the documented
support matrix matches the code.

## Testing with the shared mock

The Freighter, Albedo, and Rabet suites drive
[`createMockWallet`](../packages/wallets/src/testing/mock-wallet.ts), which owns
one configurable state machine instead of a hand-rolled fake per suite. Hana
keeps its own module fake, and Ledger injects a device through its constructor
options, but both follow the same controls:

| Control                      | Effect                                                                 |
| :--------------------------- | :--------------------------------------------------------------------- |
| `wallet.connect(address?)`   | The next connect succeeds with this address.                           |
| `wallet.sign(xdr?)`          | The next signing call returns this XDR.                                |
| `wallet.signAuthEntry(xdr?)` | The next auth-entry call returns this XDR, or `null` for no signature. |
| `wallet.reject(message?)`    | The next prompt throws, like a user rejection.                         |
| `wallet.disconnect()`        | The provider reports that no wallet is installed/connected.            |
| `wallet.calls`               | Ordered log of the provider calls the adapter made.                    |
| `wallet.reset()`             | Restore the defaults; call it in `beforeEach`.                         |

`asFreighterModule()`, `asAlbedoModule()`, and `asRabetProvider()` translate
that state into the shape each SDK expects. A new injected wallet should add an
`as<Wallet>Provider()` helper to the mock and drive it from the test, while a
hardware wallet keeps using the adapter's `createTransport` / `loadStellarApp`
options with a fake device.

The snippet below is the pattern the existing Rabet suite follows; an injected
Acme provider would look the same once `asAcmeProvider()` exists.

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { RabetAdapter } from './rabe';
import { createMockWallet } from '../testing/mock-wallet';

const wallet = createMockWallet();
type RabetWindow = Window & { rabet?: ReturnType<typeof wallet.asRabetProvider> };

describe('RabetAdapter (template for an injected wallet)', () => {
  const adapter = new RabetAdapter();

  beforeEach(() => {
    wallet.reset();
    (globalThis.window as RabetWindow).rabet = wallet.asRabetProvider();
  });

  it('connects and signs', async () => {
    wallet.connect('GRABET');
    await expect(adapter.connect()).resolves.toBe('GRABET');

    wallet.sign('signed-rabet-xdr');
    await expect(adapter.signTransaction('xdr')).resolves.toBe('signed-rabet-xdr');
  });

  it('maps a rejection to the typed error', async () => {
    wallet.reject();
    await expect(adapter.signTransaction('xdr')).rejects.toMatchObject({
      code: 'WALLET_REJECTED',
    });
  });
});
```

`src/testing/` is excluded from the package build, so the mock is never shipped;
it exists for the adapter suites in this repository.

Run the wallet suite before pushing:

```bash
pnpm --filter @stellar-starter-kit/wallets test
pnpm --filter @stellar-starter-kit/wallets typecheck
```
