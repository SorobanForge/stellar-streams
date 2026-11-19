---
'@stellar-starter-kit/ui': minor
'@stellar-starter-kit/hooks': minor
---

Add the shared UI and data-fetching pieces the dashboards were hand-rolling:

- `Select` (`@stellar-starter-kit/ui`) is a listbox-backed dropdown built on the
  `Input` recipe, with a label, disabled options and Arrow/Home/End/Enter/Space
  and Escape keyboard handling. It is exported from the package entry and shown
  in the `/ui` gallery. (#354)
- `useTokenMetadata(client, tokenId)` (`@stellar-starter-kit/hooks`) returns
  `{ metadata, loading, error }` from the SDK's cached `getTokenMetadata`, so
  amounts scale with the token's own `decimals` instead of assuming XLM. Blank
  ids resolve to `null` without a request, and concurrent reads are deduped.
  (#340)
- `useStream` now returns `isPolling` and `lastUpdatedAt`, so a "live"
  indicator can distinguish an in-flight refresh from paused polling while the
  tab is hidden. Existing result fields are unchanged. (#341)
