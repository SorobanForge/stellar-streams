# @stellar-starter-kit/hooks

React hooks for the Stellar Streams dashboard and monorepo.

## Package overview

`@stellar-starter-kit/hooks` provides React hooks that read from the
[Stellar Streams SDK](../sdk) and present stream state to components. It is a
workspace package consumed by the Next.js dashboard (`apps/web`) and any other
workspace package that depends on it.

| Item                    | Value                                                         |
| :---------------------- | :------------------------------------------------------------ |
| Package name            | `@stellar-starter-kit/hooks`                                  |
| Import path             | `@stellar-starter-kit/hooks`                                  |
| Built output            | `dist/` (`main: ./dist/index.js`, `types: ./dist/index.d.ts`) |
| Runtime peer dependency | `react` (`^18` or `^19`)                                      |
| Workspace dependencies  | `@stellar-starter-kit/sdk`, `@stellar-starter-kit/types`      |

Inside the monorepo the package is consumed through a `workspace:*` reference,
for example in `apps/web/package.json`:

```json
"@stellar-starter-kit/hooks": "workspace:*"
```

The hooks are exported from the package root:

```ts
import { useStream, useStellarNetworkStatus } from '@stellar-starter-kit/hooks';
```

The hooks are not yet imported anywhere in `apps/web`; they are available for
the dashboard and other workspace packages to consume.

---

## `useStream`

### Purpose

Loads a single stream and its claimable balance from a `StreamsClient`,
re-fetching whenever the client or stream id changes, and exposing a manual
`refresh`. Use it to render a stream's details (status, vested amount,
claimable balance, etc.) in a React component.

### Arguments

| Name     | Type                                 | Description                                                                                                                                                  |
| :------- | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client` | `StreamsClient \| null`              | The streams client used to fetch the stream. Pass `null` when no client is configured.                                                                       |
| `id`     | `bigint \| number \| string \| null` | The stream id. Pass `null` when there is nothing to load.                                                                                                    |
| `pollMs` | `number` (default `0`)               | Optional polling interval in milliseconds. When greater than `0` and a client and id are set, the stream is re-fetched on an interval. `0` disables polling. |

### Return value

| Name        | Type                  | Description                                                               |
| :---------- | :-------------------- | :------------------------------------------------------------------------ |
| `stream`    | `Stream \| null`      | The loaded stream, or `null` while loading or if it does not exist.       |
| `claimable` | `bigint`              | The claimable amount in the token's smallest unit, or `0n` while loading. |
| `loading`   | `boolean`             | `true` while a refresh is in flight.                                      |
| `error`     | `string \| null`      | Error message if loading the stream failed, otherwise `null`.             |
| `refresh`   | `() => Promise<void>` | Manually re-fetch the stream and claimable balance.                       |

### Usage example

```tsx
import { useStream } from '@stellar-starter-kit/hooks';
import { StreamsClient } from '@stellar-starter-kit/sdk';
import { formatTokenAmount } from '@stellar-starter-kit/utils';

function StreamView({ client, id }: { client: StreamsClient | null; id: string }) {
  const { stream, claimable, loading, error, refresh } = useStream(client, id, 5_000);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Failed to load: {error}</div>;
  if (!stream) return <div>No stream found.</div>;

  return (
    <div>
      <h2>Stream #{stream.id}</h2>
      <p>Claimable: {formatTokenAmount(claimable, 7)}</p>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

### Polling

Polling is opt-in via `pollMs`. When `pollMs` is greater than `0` and both
`client` and `id` are non-null, `refresh()` is invoked on a `setInterval`. The
interval is cleared when the component unmounts or when `pollMs`, `client`, or
`id` change. Pass `0` (the default) to disable automatic re-fetching.

### Loading, error, refresh and cleanup semantics

- `loading` is `true` while a refresh is in flight and `false` once it
  settles.
- A failed `getStream` call sets `error`; a failed `claimable` call is caught
  and treated as `0n` (it does not set `error`).
- `refresh()` re-fetches both the stream and the claimable balance and can be
  called manually (for example after a withdraw or cancel).
- A `mounted` ref guards state updates after unmount, and the poll interval is
  cleared on cleanup, so no state updates or timers survive the component.

---

## `useStellarNetworkStatus`

### Purpose

Reports whether the browser is currently online, used as a lightweight proxy
for Stellar network reachability. Use it to disable or warn on writes when the
browser is offline.

### Arguments

None.

### Return value

| Name     | Type      | Description                                                                                                         |
| :------- | :-------- | :------------------------------------------------------------------------------------------------------------------ |
| (result) | `boolean` | `true` when the browser is online, `false` when offline. Starts as `true` and updates on `online`/`offline` events. |

### Usage example

```tsx
import { useStellarNetworkStatus } from '@stellar-starter-kit/hooks';

function NetworkBanner() {
  const online = useStellarNetworkStatus();
  return (
    <div className={online ? 'text-emerald-500' : 'text-rose-500'}>
      {online ? 'Online' : 'You appear to be offline.'}
    </div>
  );
}
```

### How network status is fetched or refreshed

Status is derived from the browser's `online`/`offline` window events; there is
no RPC call. It starts at `true` (assuming online) and flips to `false` when
the browser fires `offline`, back to `true` on `online`. Listeners are added
on mount and removed on cleanup.

### Loading and error semantics

There is no loading state and no error state: the hook returns a synchronous
boolean and never throws.

---

## Package consumption

Inside the monorepo, `@stellar-starter-kit/hooks` is consumed through a
`workspace:*` reference (see `apps/web/package.json`). Import the hooks from
the package root:

```ts
import { useStream, useStellarNetworkStatus } from '@stellar-starter-kit/hooks';
```

The package's public API is exactly the two named exports above; there are no
default exports or additional entry points. The dashboard does not currently
import these hooks.

---

## Architecture

This package is linked from [`ARCHITECTURE.md`](../ARCHITECTURE.md) in the
client layer (`packages/hooks`).
