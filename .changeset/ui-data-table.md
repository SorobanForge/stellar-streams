---
'@stellar-starter-kit/ui': minor
---

Add a shared `DataTable` primitive so stream and split listings can share one
table implementation:

- Typed column config (`id`, `header`, `cell`, plus a required `sortValue` when
  `sortable` is set).
- Internal sorting with clickable, keyboard-reachable headers and `aria-sort`
  on every sortable column.
- Loading and empty states are caller-provided slots rather than hard-coded
  markup.

`apps/web` now renders the streams listing with `DataTable` and the `/ui`
component gallery shows its sorted, empty, and loading states.
