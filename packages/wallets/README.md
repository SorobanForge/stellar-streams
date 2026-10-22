# @stellar-starter-kit/wallets

React provider and wallet adapters for the Stellar Streams dashboard. It wraps
Freighter, Albedo, Rabet, Hana, and Ledger behind one `useWallet()` hook so
pages never touch a wallet SDK directly.

## Mounting the provider

`WalletProvider` is mounted once, above every page that needs wallet state, in
[`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx):

```tsx
import { WalletProvider } from '@stellar-starter-kit/wallets';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
```

Calling `useWallet()` outside a `WalletProvider` throws
`useWallet must be used within a WalletProvider`.

## Supported wallets

Every adapter can connect and sign a transaction envelope. Soroban
authorization entries need a wallet whose SDK exposes that operation, so only
Freighter implements `signAuthEntry`; the others raise `NotSupportedError`
instead of returning an unsigned entry.

| Adapter            | `WalletType` | Connect | Disconnect | `signTransaction` | `signAuthEntry` |
| ------------------ | ------------ | ------- | ---------- | ----------------- | --------------- |
| `FreighterAdapter` | `freighter`  | Yes     | No         | Yes               | Yes             |
| `AlbedoAdapter`    | `albedo`     | Yes     | No         | Yes               | No              |
| `RabetAdapter`     | `rabe`       | Yes     | Yes        | Yes               | No              |
| `HanaAdapter`      | `hana`       | Yes     | No         | Yes               | No              |

An auth-entry flow that targets a wallet without this capability is a
follow-up feature, not something the dashboard should attempt today.

## Ledger hardware wallet

`LedgerAdapter` signs with the Stellar app on a Ledger device and is selected
with `connect('ledger')`, like every other wallet:

```ts
const { connect } = useWallet();
await connect('ledger');
```

The adapter is also usable without React:

```ts
import { LedgerAdapter } from '@stellar-starter-kit/wallets';

const ledger = new LedgerAdapter({
  derivationPath: "44'/148'/0'",
  networkPassphrase: 'Test SDF Network ; September 2015',
});

const address = await ledger.connect();
const signedXdr = await ledger.signTransaction(xdr, { network: 'TESTNET' });
await ledger.disconnect();
```

### How it works

- **Connect.** `connect()` opens a WebHID transport, loads the Stellar app
  binding, and derives the address at the configured path (`display = false`,
  so there is no device confirmation prompt). `getPublicKey()` reuses the
  connected key or connects on demand.
- **Sign.** `signTransaction(xdr, opts)` parses the envelope with the SDK,
  sends its signature base to the device, and returns the envelope with the
  device signature attached. The provider passes its active network passphrase
  when signing.
- **Disconnect.** `disconnect()` closes the HID session and forgets the public
  key; `WalletProvider.disconnect()` calls it automatically and ignores errors
  from an already unplugged device. It is safe to call when idle.
- **Code-split transport.** `@ledgerhq/hw-transport-webhid` and
  `@ledgerhq/hw-app-str` are loaded with a dynamic `import()` inside the
  connect path. Bundlers emit them as a separate chunk, so pages that never
  select Ledger never download the transport and the default bundle stays free
  of Ledger code.

### Configuration

| Option            | Default                | Purpose                                                                                      |
| :---------------- | :--------------------- | :------------------------------------------------------------------------------------------- |
| `derivationPath`  | `44'/148'/0'`          | Account-level Stellar path. Anything that is not `44'/148'/<account>'` is rejected up front. |     | `networkPassphrase` | follows the signing call | Pins the network the adapter may sign for; Testnet applies when no network is named. |
| `createTransport` | WebHID loader          | Overrides the transport loader, e.g. for a non-WebHID host or a test harness.                |
| `loadStellarApp`  | `@ledgerhq/hw-app-str` | Overrides the app binding loader (tests).                                                    |

A signature is only valid for the network id the host hashed into the
signature base, and the Stellar app cannot report which network it expects.
Without a pinned passphrase the adapter signs for the network that
`signTransaction` names (which is how `WalletProvider` passes its active
network). With a pinned passphrase, a signing request that names a different
network is rejected with `LedgerConfigurationError` before any device call:

```
The Ledger adapter is configured for Testnet but Mainnet was requested.
Configure the adapter with the same networkPassphrase the transaction was built for.
```

### Limitations

- **WebHID is required.** Chromium-based browsers over HTTPS work; Safari and
  Firefox do not expose WebHID. `isAvailable()` returns `false` and `connect()`
  explains why instead of hanging.
- **The Stellar app must be open and the device unlocked.** A closed app is
  reported as `The Stellar app is not open on the Ledger device. Open it on the
device and try again.`; a locked device reports that it is locked.
- **No auth-entry signing.** `signAuthEntry` is not implemented, so
  `WalletProvider.signAuthEntry` raises `NotSupportedError` for Ledger.
- **Device size limits.** The Stellar app can only sign payloads up to its
  reported `maxDataSize`; oversized transactions fail with `The transaction is
too large for the Ledger device to sign.`
- **No on-device network display.** The adapter enforces the network passphrase
  in code; the device itself signs the digest it is given, so the mismatch guard
  is the only protection against signing for the wrong network.

## Usage

```tsx
'use client';

import { useWallet } from '@stellar-starter-kit/wallets';

export function StreamActions() {
  const { connect, disconnect, isConnected, activeAddress, signTransaction, signAuthEntry } =
    useWallet();

  // Connect, then persist the provider/address in localStorage automatically.
  await connect('freighter');

  const signedTx = await signTransaction(envelopeXdr);

  try {
    const signedEntry = await signAuthEntry(entryXdr);
  } catch (err) {
    // NotSupportedError: the active wallet cannot sign auth entries.
  }
}
```

The provider stores the active provider id and address under
`stellar_starter_kit_wallet_provider` and `stellar_starter_kit_wallet_address`,
restores them on mount, and removes both on `disconnect()`. When the active
adapter exposes `disconnect()` (currently Rabet), the provider also ends the
extension session and logs a warning instead of failing when the extension has
gone away.

### Errors

- **`WalletRejectedError`** – the user explicitly declined the request. Its
  `code` is `WALLET_REJECTED` and the message is the wallet's own (for example
  `User rejected the request.`).
- **`WalletCancelledError`** – the prompt was dismissed or aborted before the
  user decided. Its `code` is `WALLET_CANCELLED`; the rejection/cancellation
  split lets callers offer a retry only where it makes sense.
- Both errors are logged with `console.warn`, not `console.error`, so a
  cancelled signature does not look like a crash.
- **`NotSupportedError`** – thrown by `signAuthEntry` when the active adapter
  has no auth-entry support. Its `code` is `NOT_SUPPORTED` and the message
  names the wallet and method.
- **No active session** – signing before connecting throws
  `No active wallet session to sign transaction.` (or `... sign auth entry.`).

## Troubleshooting

### "Extension not detected"

The connection error reads `Freighter wallet extension is not installed or
enabled.` (or `Rabet wallet extension is not installed.` / `Hana wallet
extension is not installed.`).

1. Install the extension for the wallet you selected, then reload the page.
   Extension providers are injected on load, so a mid-session install is not
   visible until then.
2. Check the extension is enabled for this origin and unlocked.
3. Confirm the wallet matches the button you pressed — Rabet and Hana are
   separate extensions from Freighter.

### "Wrong network"

A transaction built for Testnet cannot be signed against Mainnet. Symptoms are
simulation failures such as `Simulation of create_stream failed: ...` or an
`Account not found` response for an address that exists on another network.

1. Switch the wallet extension to the same network the app is configured for
   (`NEXT_PUBLIC_STELLAR_NETWORK`, Testnet by default).
2. Reload so the provider re-signs with the matching passphrase.
3. Fund a Testnet account with Friendbot before retrying.

### "User rejected"

A rejection is expected behaviour, not a bug. The provider surfaces the
wallet's message and logs it at `warn` level. Offer a retry instead of an error
banner styled as a failure, and never retry automatically — the user has to
approve the next request.

## Development

```bash
pnpm --filter @stellar-starter-kit/wallets test
pnpm --filter @stellar-starter-kit/wallets typecheck
```

Tests use Vitest with jsdom and mock each wallet SDK, so no extension or
network access is required.
