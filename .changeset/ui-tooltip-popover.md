---
'@stellar-starter-kit/ui': minor
---

Add `Tooltip` and `Popover` primitives for revealing values that are truncated
in the page, such as contract addresses and long hashes:

- `Tooltip` makes its trigger a keyboard tab stop, links it to the bubble with
  `aria-describedby`, opens on hover (after a delay) or focus, and dismisses on
  blur, Escape, or a press elsewhere.
- `Popover` renders a non-modal disclosure panel from a button, closes on Escape
  (restoring focus to the trigger) and on any outside press, and supports both
  controlled and uncontrolled open state.

Both render through a portal with fixed positioning, so revealing them never
shifts the page layout, and their coordinates are clamped to the viewport with
the side flipping when there is no room. The `/ui` component gallery now shows a
truncated contract address revealed by each, with a copy action in the popover.
