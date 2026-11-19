import * as React from 'react';
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
  const invalid = Boolean(error) || ariaInvalid;
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

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-slate-900 bg-slate-950/40 p-6', className)}
    />
  );
}
