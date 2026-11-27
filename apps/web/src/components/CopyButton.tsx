'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@stellar-starter-kit/ui';

export interface CopyButtonProps {
  /** Exact text written to the clipboard when clicked. */
  value: string;
  /** Describes what is being copied (e.g. "recipient address", "contract id", "transaction hash"). */
  label: string;
  /** Milliseconds to show the "Copied" feedback state. Defaults to `2000`. */
  resetMs?: number;
  className?: string;
}

/**
 * Fallback for non-secure contexts (e.g. plain HTTP) where `navigator.clipboard`
 * is unavailable or rejects.
 */
function copyWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange?.(0, text.length);

  let copied = false;
  try {
    copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  }
  return copied;
}

async function writeToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithExecCommand(text);
    }
  }
  return copyWithExecCommand(text);
}

/**
 * Shared copy-to-clipboard button with accessible labels and transient "Copied" feedback.
 */
export default function CopyButton({
  value,
  label,
  resetMs = 2000,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copyLabel = /^copy\b/i.test(label) ? label : `Copy ${label}`;
  const copiedLabel = /^copy\b/i.test(label)
    ? label.replace(/^copy\b/i, 'Copied')
    : `Copied ${label}`;

  const handleCopy = async () => {
    if (!value) return;
    const ok = await writeToClipboard(value);
    if (!ok || !mountedRef.current) return;

    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setCopied(false);
    }, resetMs);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={!value}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? 'Copied' : copyLabel}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:border-slate-700 hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
        copied && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:text-emerald-200',
        className,
      )}
    >
      {copied ? (
        <>
          <Check aria-hidden="true" className="h-3 w-3 text-emerald-400" />
          <span>Copied</span>
        </>
      ) : (
        <Copy aria-hidden="true" className="h-3 w-3" />
      )}
    </button>
  );
}
