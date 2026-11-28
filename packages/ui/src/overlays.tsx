'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';

/**
 * Shared overlay primitives.
 *
 * Both components render their bubble/panel through a portal into
 * `document.body` and position it with `position: fixed`. That combination is
 * what keeps them from shifting layout: the bubble is never part of the
 * anchor's flow, is not clipped by `overflow` ancestors, and is not pulled back
 * into the document by a transformed/`position: relative` parent. Measurements
 * are clamped to the viewport (and the side flips when there is no room), so a
 * long contract address near an edge still shows the full value on screen.
 */

const GAP = 8;
const VIEWPORT_PADDING = 8;

export type OverlaySide = 'top' | 'bottom';
export type OverlayAlign = 'start' | 'center' | 'end';

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Portals are only available after mount, so SSR renders the anchor alone. */
function usePortalHost() {
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setHost(document.body);
  }, []);

  return host;
}

interface AnchoredPosition {
  setOverlay: (node: HTMLElement | null) => void;
  overlay: HTMLElement | null;
  position: React.CSSProperties;
}

/**
 * Tracks the anchor's viewport rect and clamps the overlay to the viewport.
 * Re-measures on open, scroll and resize; the fixed coordinates are inline
 * styles so no layout pass on the page itself is triggered.
 */
function useAnchoredPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean,
  side: OverlaySide,
  align: OverlayAlign,
): AnchoredPosition {
  const [overlay, setOverlay] = React.useState<HTMLElement | null>(null);
  const [position, setPosition] = React.useState<React.CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
  });

  useIsomorphicLayoutEffect(() => {
    if (!open || !overlay) return;

    const update = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const width = overlay.offsetWidth;
      const height = overlay.offsetHeight;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const fitsAbove = anchor.top - height - GAP >= VIEWPORT_PADDING;
      const fitsBelow = anchor.bottom + height + GAP <= viewportHeight - VIEWPORT_PADDING;

      let top = side === 'top' ? anchor.top - height - GAP : anchor.bottom + GAP;
      if (side === 'top' && !fitsAbove && fitsBelow) top = anchor.bottom + GAP;
      if (side === 'bottom' && !fitsBelow && fitsAbove) top = anchor.top - height - GAP;
      top = clamp(top, VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING);

      let left =
        align === 'start'
          ? anchor.left
          : align === 'end'
            ? anchor.right - width
            : anchor.left + anchor.width / 2 - width / 2;
      left = clamp(left, VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING);

      setPosition({ position: 'fixed', top, left });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef, align, open, overlay, side]);

  return { setOverlay, overlay, position };
}

export interface TooltipProps {
  /** The revealed value. Keep it short: tooltips are not a navigation surface. */
  content: React.ReactNode;
  /** The truncated value shown in the page. The wrapper is the tab stop. */
  children: React.ReactNode;
  side?: OverlaySide;
  align?: OverlayAlign;
  /** Delay before a hover reveals the tooltip, in milliseconds. Focus is immediate. */
  delay?: number;
  className?: string;
  contentClassName?: string;
}

/**
 * Reveals the full value of truncated content on hover or keyboard focus.
 *
 * The trigger wrapper is focusable and owns an `aria-describedby` pointing at
 * the bubble, so the description is available to assistive technology even
 * when the bubble is visually hidden. The bubble itself is non-interactive
 * (`pointer-events: none`), meaning hovering it never fights with the anchor.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delay = 150,
  className,
  contentClassName,
}: TooltipProps) {
  const id = React.useId();
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const timerRef = React.useRef<number | undefined>(undefined);
  const [open, setOpen] = React.useState(false);
  const host = usePortalHost();
  const { setOverlay, position } = useAnchoredPosition(anchorRef, open, side, align);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  const show = React.useCallback(
    (immediate: boolean) => {
      clearTimer();
      if (immediate || delay <= 0) {
        setOpen(true);
        return;
      }
      timerRef.current = window.setTimeout(() => setOpen(true), delay);
    },
    [clearTimer, delay],
  );

  const hide = React.useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  // Dismiss a hover-revealed tooltip when the pointer goes elsewhere.
  React.useEffect(() => {
    if (!open) return;

    const dismiss = (event: Event) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      if (target && (target as Element).closest?.('[role="tooltip"]')) return;
      hide();
    };

    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [hide, open]);

  return (
    <>
      <span
        ref={anchorRef}
        tabIndex={0}
        aria-describedby={id}
        onPointerEnter={() => show(false)}
        onPointerLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            hide();
          }
        }}
        className={cn(
          'inline-flex max-w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
          className,
        )}
      >
        {children}
      </span>

      {host
        ? createPortal(
            <span
              ref={setOverlay}
              id={id}
              role="tooltip"
              hidden={!open}
              style={position}
              className={cn(
                'pointer-events-none z-[60] max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed break-all text-slate-200 shadow-xl',
                contentClassName,
              )}
            >
              {content}
            </span>,
            host,
          )
        : null}
    </>
  );
}

export interface PopoverProps {
  /** Content of the trigger button. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Accessible name for the panel. */
  label: string;
  /** Accessible name for the trigger, when its content is not descriptive text. */
  triggerLabel?: string;
  side?: OverlaySide;
  align?: OverlayAlign;
  /** Controlled open state. Omit to let the popover manage its own state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  triggerClassName?: string;
}

/**
 * A non-modal disclosure panel anchored to a button. Closes on Escape (returning
 * focus to the trigger) and on any pointer press outside the panel and trigger.
 * The panel is portalled and fixed-positioned like `Tooltip`, so revealing it
 * never reflows the page.
 */
export function Popover({
  trigger,
  children,
  label,
  triggerLabel,
  side = 'bottom',
  align = 'start',
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  triggerClassName,
}: PopoverProps) {
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const host = usePortalHost();
  const { setOverlay, overlay, position } = useAnchoredPosition(triggerRef, open, side, align);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  // Move focus into the panel so its content is reachable from the trigger;
  // `preventScroll` keeps the reveal from scrolling the page.
  React.useEffect(() => {
    if (open) overlay?.focus({ preventScroll: true });
  }, [open, overlay]);

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (overlay?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, overlay, setOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={triggerLabel}
        data-state={open ? 'open' : 'closed'}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:outline-none',
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {host
        ? createPortal(
            <div
              ref={setOverlay}
              id={panelId}
              role="dialog"
              aria-label={label}
              data-state={open ? 'open' : 'closed'}
              hidden={!open}
              tabIndex={-1}
              style={position}
              className={cn(
                'z-[60] max-h-[calc(100vh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 shadow-2xl outline-none',
                className,
              )}
            >
              {children}
            </div>,
            host,
          )
        : null}
    </>
  );
}
