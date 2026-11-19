import * as React from 'react';
import type { StreamStatus } from '@stellar-starter-kit/types';
import { AlertCircle, CheckCircle2, ChevronDown, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from './utils';

const buttonBase =
  'inline-flex items-center justify-center gap-2 font-semibold transition disabled:pointer-events-none disabled:opacity-40';

const buttonVariants = {
  primary:
    'rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-lg hover:brightness-110',
  secondary: 'rounded-xl bg-purple-600 text-white hover:bg-purple-500',
  ghost: 'rounded-lg text-slate-400 hover:text-white',
  danger: 'rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
} as const;

const buttonSizes = {
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-6 py-3 text-sm',
} as const;

const inputBase =
  'w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 placeholder:text-slate-500 focus:border-purple-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40';

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
}

export function Input({
  className,
  label,
  error,
  id,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const invalid = Boolean(error) || ariaInvalid;
  const inputId =
    id ?? (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <label className="block" htmlFor={inputId}>
      {label ? (
        <span className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase">
          {label}
        </span>
      ) : null}
      <input
        {...props}
        id={inputId}
        aria-label={typeof label === 'string' ? label : undefined}
        aria-invalid={invalid || undefined}
        className={cn(inputBase, invalid && 'border-rose-500/50 focus:border-rose-500', className)}
      />
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs text-rose-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export interface SelectOption {
  value: string;
  /** Rendered inside the trigger and the option row. */
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: readonly SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Visible field label; also names the combobox for assistive technology. */
  label?: React.ReactNode;
  disabled?: boolean;
  /** Shown when no option matches `value`. */
  placeholder?: string;
  id?: string;
  className?: string;
}

/**
 * A listbox-backed select for network and token choices.
 *
 * Supports Arrow keys, Home/End, Enter/Space and Escape, so the interaction is
 * testable in jsdom where a native `<select>` cannot be driven by keyboard
 * events. Styling reuses the `Input` recipe and `cn`.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  disabled = false,
  placeholder = 'Select…',
  id,
  className,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const optionRefs = React.useRef<Array<HTMLLIElement | null>>([]);

  const selectId =
    id ?? (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const listboxId = `${selectId ?? 'select'}-listbox`;
  const labelId = `${listboxId}-label`;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const enabledIndexes = options.reduce<number[]>((indexes, option, index) => {
    if (!option.disabled) indexes.push(index);
    return indexes;
  }, []);

  // Dismiss on a pointer press outside, without closing on the option's own
  // mousedown (which a blur handler would do before the click lands).
  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const openList = () => {
    setActiveIndex(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : (enabledIndexes[0] ?? -1),
    );
    setOpen(true);
  };

  const closeList = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closeList(true);
  };

  const moveActive = (delta: 1 | -1) => {
    if (!open) {
      openList();
      return;
    }
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);
    const nextPosition =
      position === -1
        ? delta > 0
          ? 0
          : enabledIndexes.length - 1
        : (position + delta + enabledIndexes.length) % enabledIndexes.length;
    const next = enabledIndexes[nextPosition]!;
    setActiveIndex(next);
    optionRefs.current[next]?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(enabledIndexes[0] ?? -1);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(activeIndex);
        else openList();
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          closeList(true);
        }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {label ? (
        <span
          id={labelId}
          className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase"
        >
          {label}
        </span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        aria-label={typeof label === 'string' ? label : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) closeList();
          else openList();
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          inputBase,
          'flex items-center justify-between gap-2 text-left focus-visible:ring-2 focus-visible:ring-purple-500/40',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        <span className={cn('truncate', !selected && 'text-slate-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-900 bg-slate-950 p-1 shadow-2xl"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === activeIndex || undefined}
              onMouseEnter={() => {
                if (!option.disabled) setActiveIndex(index);
              }}
              onClick={() => choose(index)}
              className={cn(
                'cursor-pointer rounded-lg px-3 py-2 font-mono text-sm text-slate-300',
                index === activeIndex && 'bg-slate-900 text-white',
                option.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-slate-900 bg-slate-950/40 p-6', className)}
    />
  );
}

/**
 * Every state a stream badge can render. `StreamStatus` covers the four states
 * `getStreamStatus` derives from a schedule; `paused` is the dashboard's
 * operator-facing state. The `(string & {})` member keeps autocomplete for the
 * known values while still allowing an unrecognised status at runtime, which
 * falls back to the neutral badge.
 */
export type StatusBadgeStatus = StreamStatus | 'paused' | (string & {});

const statusBadgeVariants = {
  scheduled: 'border-purple-500/30 bg-purple-500/10 text-purple-200',
  streaming: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  cancelled: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  paused: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  unknown: 'border-slate-700 bg-slate-800/40 text-slate-300',
} as const;

const statusBadgeLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  streaming: 'Streaming',
  completed: 'Completed',
  cancelled: 'Cancelled',
  paused: 'Paused',
  unknown: 'Unknown',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
}

/**
 * The single owner of the stream-status → colour/label mapping. Unknown values
 * render a neutral "Unknown" badge rather than nothing.
 */
export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  // Own-property check, so inherited names ("constructor", "toString") still
  // fall through to the neutral badge instead of matching a prototype member.
  const key: keyof typeof statusBadgeVariants = Object.hasOwn(statusBadgeVariants, status)
    ? (status as keyof typeof statusBadgeVariants)
    : 'unknown';
  return (
    <span
      {...props}
      data-status={key}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide',
        statusBadgeVariants[key],
        className,
      )}
    >
      {statusBadgeLabels[key]}
    </span>
  );
}

export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  /** Vesting progress, 0-100. Values outside the range are clamped; `NaN` is indeterminate. */
  value: number;
  /** Accessible name for the bar. */
  label?: string;
}

/** Determinate vesting progress with an indeterminate fallback for bad input. */
export function ProgressBar({ value, label, className, ...props }: ProgressBarProps) {
  const indeterminate = Number.isNaN(value);
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div
      {...props}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuetext={indeterminate ? 'Indeterminate' : undefined}
      data-indeterminate={indeterminate || undefined}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-900', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all',
          indeterminate && 'w-1/3 animate-pulse motion-reduce:animate-none',
        )}
        style={indeterminate ? undefined : { width: `${clamped}%` }}
      />
    </div>
  );
}

const skeletonRounded = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
} as const;

export type SkeletonRounded = keyof typeof skeletonRounded;

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string;
  height?: number | string;
  rounded?: SkeletonRounded;
}

/**
 * A layout-preserving placeholder. Hidden from assistive technology by design:
 * pair it with a real live region that announces the loading state.
 */
export function Skeleton({
  width,
  height,
  rounded = 'md',
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-slate-800/60 motion-reduce:animate-none',
        skeletonRounded[rounded],
        className,
      )}
      style={{ width, height, ...style }}
    />
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const alertTones = {
  info: {
    role: 'status',
    icon: Info,
    container: 'border-cyan-500/20 bg-cyan-500/5 text-cyan-300',
    title: 'text-cyan-200',
    iconClassName: 'text-cyan-400',
  },
  success: {
    role: 'status',
    icon: CheckCircle2,
    container: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    title: 'text-emerald-200',
    iconClassName: 'text-emerald-400',
  },
  warning: {
    role: 'status',
    icon: TriangleAlert,
    container: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
    title: 'text-amber-200',
    iconClassName: 'text-amber-400',
  },
  error: {
    role: 'alert',
    icon: AlertCircle,
    container: 'border-rose-500/20 bg-rose-500/5 text-rose-300',
    title: 'text-rose-200',
    iconClassName: 'text-rose-400',
  },
} as const;

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: React.ReactNode;
  /** Renders a dismiss button when provided; the caller owns the visibility state. */
  onDismiss?: () => void;
  /** Accessible name for the dismiss button. */
  dismissLabel?: string;
}

/** Shared inline message for info, success, warning and error tones. */
export function Alert({
  tone = 'info',
  title,
  children,
  onDismiss,
  dismissLabel = 'Dismiss',
  className,
  ...props
}: AlertProps) {
  const { role, icon: Icon, container, title: titleClassName, iconClassName } = alertTones[tone];

  return (
    <div
      {...props}
      role={role}
      className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm', container, className)}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', iconClassName)} />
      <div className="min-w-0 flex-1">
        {title ? <h4 className={cn('font-semibold', titleClassName)}>{title}</h4> : null}
        <div className={cn('leading-relaxed font-light', title && 'mt-1')}>{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="ml-1 shrink-0 rounded-lg p-1 text-current opacity-70 transition hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
