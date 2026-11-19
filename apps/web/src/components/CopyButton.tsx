'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CopyButtonProps {
  /** Text written to the clipboard. */
  value: string;
  /** What the value is, e.g. "recipient address"; used in the accessible name. */
  label: string;
  /** How long the "Copied" feedback stays visible, in milliseconds. */
  feedbackMs?: number;
  className?: string;
}

/**
 * Copies `value` and confirms it inline.
 *
 * Uses the Clipboard API when it is available and falls back to a hidden
 * textarea plus `document.execCommand('copy')` on insecure origins (plain HTTP
 * and some embedded browsers) where `navigator.clipboard` is undefined.
 */
async function copyText(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    throw new Error('Clipboard is not available');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command failed');
  } finally {
    document.body.removeChild(textarea);
  }
}

export function CopyButton({ value, label, feedbackMs = 1_500, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), feedbackMs);
    } catch {
      // Leave the button idle: there is nothing useful to show if the browser
      // refuses clipboard access, and the value stays selectable on the page.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
      title={copied ? 'Copied' : `Copy ${label}`}
      data-copied={copied || undefined}
      className={
        'inline-flex items-center gap-1 rounded-md p-1 text-slate-500 transition hover:text-white focus-visible:ring-2 focus-visible:ring-purple-500/40 focus-visible:outline-none ' +
        (className ?? '')
      }
    >
      {copied ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      <span aria-live="polite" className={copied ? 'text-[10px] text-emerald-400' : 'sr-only'}>
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}
