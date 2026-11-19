---
'@stellar-starter-kit/ui': minor
---

Add four shared UI primitives so dashboards stop hand-rolling status, progress,
loading and notification markup:

- `StatusBadge` owns the stream-status → colour/label mapping (including
  `paused`) and falls back to a neutral badge for unknown values.
- `ProgressBar` renders determinate vesting progress with `role="progressbar"`,
  clamps out-of-range values and shows an indeterminate state for `NaN`.
- `Skeleton` provides reduced-motion-safe, `aria-hidden` loading placeholders.
- `Alert` renders info, success, warning and error tones with matching icons,
  the correct ARIA role and an optional dismiss handler.

`apps/web` now uses `StatusBadge`, `ProgressBar` and `Skeleton` on the streams
dashboard, and `NotificationBanner` delegates its presentation to `Alert`.
