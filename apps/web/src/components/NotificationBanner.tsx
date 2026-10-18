'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export type NotificationKind = 'error' | 'success';

interface NotificationBannerProps {
  /** `null` hides the banner; the component stays mounted so exit animations play. */
  kind: NotificationKind | null;
  message: string;
  /** Optional heading shown above the message (escrow-style banners). */
  title?: string;
  /** Margin utility applied to the banner element (e.g. `mb-6` or `mt-6`). */
  className?: string;
  /** Which edge the banner animates in from. */
  enterFrom?: 'top' | 'bottom';
}

/**
 * Animated error/success banner. Wraps framer-motion so pages can load it
 * with `next/dynamic` and keep framer-motion out of their initial bundle.
 */
export default function NotificationBanner({
  kind,
  message,
  title,
  className,
  enterFrom = 'bottom',
}: NotificationBannerProps) {
  const offset = enterFrom === 'top' ? -6 : 10;
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: offset }}
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${className ?? ''} ${
            kind === 'error'
              ? 'border-rose-500/20 bg-rose-500/5 text-rose-300'
              : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
          }`}
        >
          {kind === 'error' ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          )}
          <div>
            {title && (
              <h4
                className={`font-semibold ${
                  kind === 'error' ? 'text-rose-200' : 'text-emerald-200'
                }`}
              >
                {title}
              </h4>
            )}
            <p className={title ? 'mt-1 leading-relaxed font-light' : 'font-light'}>{message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
