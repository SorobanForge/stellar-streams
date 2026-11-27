import * as React from 'react';
import type { StreamStatus } from '@stellar-starter-kit/types';
import { AlertCircle, Check, CheckCircle2, ChevronDown, Info, TriangleAlert, X } from 'lucide-react';
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

const fieldBase =
  'w-full rounded-xl border bg-slate-950 font-mono text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40';

const fieldVariants = {
  default: 'border-slate-900 focus:border-purple-500 focus:ring-purple-500/20',
  error: 'border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20',
} as const;

const fieldSizes = {
  sm: 'px-3 py-2 text-xs',
  md: 'px-4 py-2.5 text-sm',
} as const;

export type FieldVariant = keyof typeof fieldVariants;
export type FieldSize = keyof typeof fieldSizes;

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
  variant?: FieldVariant;
}

export function Input({
  className,
  label,
  error,
  variant,
  id,
  'aria-invalid': ariaInvalid,
  ...props
}: InputProps) {
  const invalid = Boolean(error) || Boolean(ariaInvalid) || variant === 'error';
  const resolvedVariant: FieldVariant = invalid ? 'error' : (variant ?? 'default');
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
        className={cn(fieldBase, fieldVariants[resolvedVariant], fieldSizes.md, className)}
      />
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs text-rose-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/**
 * Normalises a raw numeric string without ever converting it to a number.
 *
 * Only digits and a single decimal separator survive; anything else (signs,
 * letters, whitespace, a second separator) is dropped, which is what a paste
 * of "1,234.50"/"abc" needs to become valid input. Fraction digits beyond
 * `decimals` are truncated rather than rounded, so a value never changes size.
 * Leading zeros are collapsed, keeping one before a decimal point ("007" ->
 * "7", "00.5" -> "0.5").
 */
export function sanitizeNumberInput(raw: string, decimals?: number): string {
  const maxFraction = decimals === undefined ? undefined : Math.max(0, Math.trunc(decimals));
  let integer = '';
  let fraction = '';
  let hasSeparator = false;

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (hasSeparator) {
        if (maxFraction !== undefined && fraction.length >= maxFraction) continue;
        fraction += char;
      } else {
        integer += char;
      }
    } else if (char === '.' && !hasSeparator) {
      hasSeparator = true;
      // With no fraction digits allowed the separator itself is dropped, so
      // pasting "1.5" yields "1" instead of "15".
    }
  }

  if (integer === '' && fraction === '' && !hasSeparator) return '';

  integer = integer.replace(/^0+(?=\d)/, '');
  if (integer === '') integer = '0';

  return hasSeparator && maxFraction !== 0 ? `${integer}.${fraction}` : integer;
}

export interface NumberInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> {
  label?: React.ReactNode;
  error?: string;
  /** Raw string value; never parsed or rounded. */
  value?: string;
  defaultValue?: string;
  /** Receives the sanitised raw string, ready for `parseTokenAmount`. */
  onValueChange?: (value: string) => void;
  /** Alias of `onValueChange`, matching the prop name of `Input`. */
  onChange?: (value: string) => void;
  /** Maximum fraction digits. Extra digits are truncated as they are typed. */
  decimals?: number;
}

/**
 * String-backed numeric input for token amounts.
 *
 * A `type="number"` input converts through a float, which loses precision on
 * large stroop values and silently rejects formats it does not understand. This
 * input keeps the value as the string the user typed (sanitised for precision),
 * so callers can pass it straight to `parseTokenAmount`. `inputMode="decimal"`
 * asks mobile browsers for a numeric keypad without the float conversion.
 */
export function NumberInput({
  className,
  label,
  error,
  id,
  value,
  defaultValue = '',
  onValueChange,
  onChange,
  decimals,
  'aria-invalid': ariaInvalid,
  ...props
}: NumberInputProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(() =>
    sanitizeNumberInput(defaultValue, decimals),
  );
  const displayValue = sanitizeNumberInput(isControlled ? value : internalValue, decimals);
  const invalid = Boolean(error) || Boolean(ariaInvalid);
  const inputId =
    id ?? (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = sanitizeNumberInput(event.target.value, decimals);
    if (!isControlled) setInternalValue(next);
    onValueChange?.(next);
    onChange?.(next);
  };

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
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        aria-label={typeof label === 'string' ? label : undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          fieldBase,
          fieldVariants[invalid ? 'error' : 'default'],
          fieldSizes.md,
          className,
        )}
      />
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs text-rose-400">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const spinnerSizes = {
  sm: 'h-3 w-3 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

export type SpinnerSize = keyof typeof spinnerSizes;

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  /**
   * Accessible busy label. Without it the spinner is decorative and hidden from
   * assistive technology; with it the spinner becomes a `status` region.
   */
  label?: string;
}

export function Spinner({ size = 'md', label, className, ...props }: SpinnerProps) {
  return (
    <span
      {...props}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-none',
        spinnerSizes[size],
        className,
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectVariant = FieldVariant;
export type SelectSize = FieldSize;

export interface SelectProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultValue' | 'onChange'
> {
  options: readonly SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  label?: React.ReactNode;
  error?: string;
  placeholder?: string;
  variant?: SelectVariant;
  size?: SelectSize;
}

/**
 * Accessible dropdown select matching `Input`'s variant and focus-ring styles.
 * Supports keyboard navigation (ArrowDown, ArrowUp, Home, End, Enter, Space, Escape)
 * in both browsers and jsdom.
 */
export function Select({
  options,
  value,
  defaultValue,
  onChange,
  label,
  error,
  placeholder = 'Select an option',
  variant,
  size = 'md',
  disabled,
  id,
  className,
  onClick,
  onKeyDown,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  ...props
}: SelectProps) {
  const invalid = Boolean(error) || Boolean(ariaInvalid) || variant === 'error';
  const resolvedVariant: SelectVariant = invalid ? 'error' : (variant ?? 'default');
  const reactId = React.useId();
  const selectId =
    id ??
    (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : `select-${reactId}`);
  const labelId = `${selectId}-label`;
  const listboxId = `${selectId}-listbox`;

  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const currentValue = value !== undefined ? value : internalValue;
  const selectedOption = options.find((option) => option.value === currentValue);

  const findEnabledIndex = React.useCallback(
    (startIndex: number, step: 1 | -1): number => {
      if (options.length === 0) return -1;
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (startIndex + offset * step + options.length) % options.length;
        if (!options[index]?.disabled) return index;
      }
      return -1;
    },
    [options],
  );

  const openMenu = React.useCallback(
    (edge: 'first' | 'last' = 'first') => {
      if (disabled || options.length === 0) return;
      const selectedIdx = options.findIndex(
        (option) => option.value === currentValue && !option.disabled,
      );
      const nextActive =
        selectedIdx >= 0
          ? selectedIdx
          : edge === 'last'
            ? findEnabledIndex(options.length - 1, -1)
            : findEnabledIndex(0, 1);
      setActiveIndex(nextActive);
      setOpen(true);
    },
    [currentValue, disabled, findEnabledIndex, options],
  );

  const selectIndex = React.useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      if (value === undefined) setInternalValue(option.value);
      onChange?.(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange, options, value],
  );

  React.useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  React.useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;

    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu('first');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu('last');
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = findEnabledIndex(activeIndex < 0 ? 0 : activeIndex + 1, 1);
        if (next >= 0) setActiveIndex(next);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const prev = findEnabledIndex(activeIndex < 0 ? options.length - 1 : activeIndex - 1, -1);
        if (prev >= 0) setActiveIndex(prev);
        break;
      }
      case 'Home': {
        event.preventDefault();
        const first = findEnabledIndex(0, 1);
        if (first >= 0) setActiveIndex(first);
        break;
      }
      case 'End': {
        event.preventDefault();
        const last = findEnabledIndex(options.length - 1, -1);
        if (last >= 0) setActiveIndex(last);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (activeIndex >= 0) selectIndex(activeIndex);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      }
      case 'Tab': {
        setOpen(false);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative block">
      {label ? (
        <label
          id={labelId}
          htmlFor={selectId}
          className="mb-2 block text-xs font-semibold tracking-wider text-slate-500 uppercase"
        >
          {label}
        </label>
      ) : null}
      <button
        {...props}
        ref={triggerRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        aria-labelledby={!ariaLabel && label && typeof label !== 'string' ? labelId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${selectId}-option-${activeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled) return;
          if (open) {
            setOpen(false);
          } else {
            openMenu('first');
          }
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          fieldBase,
          fieldVariants[resolvedVariant],
          fieldSizes[size],
          'flex items-center justify-between gap-2 text-left',
          className,
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-slate-500')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (ariaLabel ?? 'Options') : undefined}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-800 bg-slate-950 py-1 shadow-xl"
        >
          {options.map((option, index) => {
            const isSelected = option.value === currentValue;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${selectId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onMouseEnter={() => {
                  if (!option.disabled) setActiveIndex(index);
                }}
                onClick={() => selectIndex(index)}
                className={cn(
                  'flex cursor-pointer items-center justify-between px-4 py-2 font-mono text-sm transition-colors',
                  isActive ? 'bg-purple-500/20 text-white' : 'text-slate-300',
                  isSelected && 'text-cyan-300',
                  option.disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs text-rose-400">
          {error}
        </span>
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

export interface ModalProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'title' | 'role' | 'aria-modal' | 'aria-labelledby'
> {
  /** Whether the dialog is visible. */
  open: boolean;
  /** Called with false when the user presses Escape. */
  onOpenChange: (open: boolean) => void;
  /** Required accessible name for the dialog. */
  title: string;
}

/** Accessible modal dialog with focus trapping and trigger focus restoration. */
export function Modal({ open, onOpenChange, title, children, className, ...props }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const titleId = `modal-title-${React.useId()}`;

  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;

    const activeDialog = dialogRef.current;
    if (!activeDialog) return;
    const dialog: HTMLDivElement = activeDialog;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusableElements = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'),
      );
    const focusFirstElement = () => (getFocusableElements()[0] ?? dialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === firstElement || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === lastElement || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        focusFirstElement();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    focusFirstElement();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div
        {...props}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-200 shadow-2xl',
          className,
        )}
      >
        <h2 id={titleId} className="text-lg font-semibold text-white">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export const Dialog = Modal;
