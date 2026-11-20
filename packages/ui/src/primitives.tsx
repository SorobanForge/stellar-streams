import * as React from 'react';
import type { StreamStatus } from '@stellar-starter-kit/types';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
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

interface TabsContextValue {
  id: string;
  value: string | undefined;
  select: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext(componentName: string) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error(`${componentName} must be used within a Tabs component.`);
  }
  return context;
}

function getTabId(id: string, value: string) {
  return `${id}-tab-${encodeURIComponent(value)}`;
}

function getTabPanelId(id: string, value: string) {
  return `${id}-panel-${encodeURIComponent(value)}`;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Selected tab value. Provide this with onValueChange for controlled state. */
  value?: string;
  /** Initially selected tab value when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

/** Accessible tab group with controlled and uncontrolled selection. */
export function Tabs({ value, defaultValue, onValueChange, className, ...props }: TabsProps) {
  const id = React.useId();
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const selectedValue = value !== undefined ? value : uncontrolledValue;
  const select = React.useCallback(
    (nextValue: string) => {
      if (value === undefined) {
        setUncontrolledValue(nextValue);
      }
      onValueChange?.(nextValue);
    },
    [onValueChange, value],
  );

  return (
    <TabsContext.Provider value={{ id, value: selectedValue, select }}>
      <div {...props} className={className} />
    </TabsContext.Provider>
  );
}

export type TabsListProps = React.HTMLAttributes<HTMLDivElement>;

export function TabsList({ className, ...props }: TabsListProps) {
  useTabsContext('TabsList');
  return (
    <div
      {...props}
      role="tablist"
      aria-orientation="horizontal"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-slate-900 bg-slate-950/60 p-1',
        className,
      )}
    />
  );
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({
  value,
  disabled,
  onClick,
  onFocus,
  onKeyDown,
  className,
  ...props
}: TabsTriggerProps) {
  const context = useTabsContext('TabsTrigger');
  const selected = context.value === value;

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const key = event.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;

    const tabList = event.currentTarget.closest('[role="tablist"]');
    if (!tabList) return;

    const enabledTabs = Array.from(
      tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const currentIndex = enabledTabs.indexOf(event.currentTarget);
    if (currentIndex < 0 || enabledTabs.length === 0) return;

    event.preventDefault();
    const nextIndex =
      key === 'Home'
        ? 0
        : key === 'End'
          ? enabledTabs.length - 1
          : (currentIndex + (key === 'ArrowRight' ? 1 : -1) + enabledTabs.length) %
            enabledTabs.length;
    enabledTabs[nextIndex]?.focus();
  }

  return (
    <button
      {...props}
      type="button"
      role="tab"
      id={getTabId(context.id, value)}
      aria-controls={getTabPanelId(context.id, value)}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      data-state={selected ? 'active' : 'inactive'}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) context.select(value);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented && !disabled) context.select(value);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-lg px-4 py-2 text-sm font-semibold text-slate-400 transition hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 data-[state=active]:bg-purple-600/20 data-[state=active]:text-white data-[state=active]:shadow',
        className,
      )}
    />
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const context = useTabsContext('TabsContent');
  const selected = context.value === value;

  return (
    <div
      {...props}
      role="tabpanel"
      id={getTabPanelId(context.id, value)}
      aria-labelledby={getTabId(context.id, value)}
      tabIndex={0}
      hidden={!selected}
      className={cn(
        'mt-4 rounded-xl border border-slate-900 bg-slate-950/40 p-5 text-sm text-slate-300',
        className,
      )}
    />
  );
}
