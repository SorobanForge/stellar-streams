'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from './utils';

/** The three kinds of notification the app reports transaction results with. */
export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Secondary line under the title, e.g. a short explanation or a backend message. */
  description?: string;
  /** Transaction hash to link to in the explorer. */
  hash?: string;
  /** Explorer base URL for `hash`. Defaults to the provider's. */
  explorerUrl?: string;
  /**
   * Milliseconds before the toast auto-dismisses, overriding the provider's
   * default. Pass `0` to keep it until the user dismisses it.
   */
  duration?: number;
}

export interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  title: string;
  duration: number;
}

export interface ToastContextValue {
  /** Toasts currently on screen, oldest first. */
  toasts: ToastRecord[];
  /** Shows a toast of any variant and returns its id. */
  show: (variant: ToastVariant, title: string, options?: ToastOptions) => string;
  /** Shows a success toast, e.g. a confirmed transaction. */
  success: (title: string, options?: ToastOptions) => string;
  /** Shows an error toast, e.g. a rejected transaction or a failed call. */
  error: (title: string, options?: ToastOptions) => string;
  /** Shows an informational toast. */
  info: (title: string, options?: ToastOptions) => string;
  /** Dismisses one toast by id. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5_000;
const DEFAULT_EXPLORER_URL = 'https://stellar.expert/explorer/testnet';
const DEFAULT_MAX_TOASTS = 4;

export interface ToastProviderProps {
  children: ReactNode;
  /** Auto-dismiss delay in milliseconds. Defaults to 5000; `0` disables it. */
  defaultDuration?: number;
  /** Explorer base URL transaction hashes link to. */
  explorerUrl?: string;
  /** How many toasts stay on screen at once; the oldest is dropped first. */
  maxToasts?: number;
}

/**
 * Renders transaction and error notifications for a whole app.
 *
 * Toasts are shown by descendants through {@link useToast}, live in a portal on
 * `document.body`, announce themselves through a polite live region, and pause
 * their auto-dismiss timer while the pointer or keyboard focus is on them.
 */
export function ToastProvider({
  children,
  defaultDuration = DEFAULT_DURATION_MS,
  explorerUrl = DEFAULT_EXPLORER_URL,
  maxToasts = DEFAULT_MAX_TOASTS,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [portalReady, setPortalReady] = useState(false);
  const nextId = useRef(0);

  // Portals need a DOM node, so render the container only after hydration.
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (variant: ToastVariant, title: string, options: ToastOptions = {}) => {
      nextId.current += 1;
      const id = `toast-${nextId.current}`;
      const toast: ToastRecord = {
        id,
        variant,
        title,
        duration: options.duration ?? defaultDuration,
        ...options,
      };
      setToasts((current) => [...current, toast].slice(-maxToasts));
      return id;
    },
    [defaultDuration, maxToasts],
  );

  const success = useCallback(
    (title: string, options?: ToastOptions) => show('success', title, options),
    [show],
  );
  const error = useCallback(
    (title: string, options?: ToastOptions) => show('error', title, options),
    [show],
  );
  const info = useCallback(
    (title: string, options?: ToastOptions) => show('info', title, options),
    [show],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, show, success, error, info, dismiss }),
    [toasts, show, success, error, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {portalReady &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
          >
            <AnimatePresence initial={false}>
              {toasts.map((toast) => (
                <ToastItem
                  key={toast.id}
                  toast={toast}
                  explorerUrl={toast.explorerUrl ?? explorerUrl}
                  onDismiss={dismiss}
                />
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/** Access the toast API. Must be rendered inside a {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: string }> = {
  success: {
    container: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    icon: 'text-emerald-400',
  },
  error: {
    container: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
    icon: 'text-rose-400',
  },
  info: {
    container: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
    icon: 'text-cyan-400',
  },
};

const VARIANT_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

interface ToastItemProps {
  toast: ToastRecord;
  explorerUrl: string;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, explorerUrl, onDismiss }: ToastItemProps) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = VARIANT_STYLES[toast.variant];
  const Icon = VARIANT_ICONS[toast.variant];

  useEffect(() => {
    if (paused || toast.duration <= 0) return;
    const startedAt = Date.now();
    timer.current = setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, toast.duration, toast.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 text-sm shadow-lg backdrop-blur-md',
        styles.container,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', styles.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{toast.title}</p>
        {toast.description && <p className="mt-1 font-light opacity-80">{toast.description}</p>}
        {toast.hash && (
          <a
            href={`${explorerUrl}/tx/${toast.hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            View transaction
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-md p-1 opacity-60 transition hover:opacity-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.div>
  );
}
