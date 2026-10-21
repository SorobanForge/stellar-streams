# @stellar-starter-kit/wallets

React provider and wallet adapters for the Stellar Streams dashboard. It wraps
Freighter, Albedo, Rabet, and Hana behind one `useWallet()` hook so pages never
touch a wallet SDK directly.

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

| Adapter            | `WalletType` | Connect | `signTransaction` | `signAuthEntry` |
| ------------------ | ------------ | ------- | ----------------- | --------------- |
| `FreighterAdapter` | `freighter`  | Yes     | Yes               | Yes             |
| `AlbedoAdapter`    | `albedo`     | Yes     | Yes               | No              |
| `RabetAdapter`     | `rabe`       | Yes     | Yes               | No              |
| `HanaAdapter`      | `hana`       | Yes     | Yes               | No              |

An auth-entry flow that targets a wallet without this capability is a
follow-up feature, not something the dashboard should attempt today.

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
restores them on mount, and removes both on `disconnect()`.

### Errors

- **User rejection** – signing rejects with the wallet's message (for example
  `User rejected the request.`). The provider logs it with `console.warn`, not
  `console.error`, so a cancelled signature does not look like a crash.
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
