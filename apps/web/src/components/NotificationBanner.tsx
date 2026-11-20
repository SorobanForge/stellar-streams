'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Alert } from '@stellar-starter-kit/ui';

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
 * with `next/dynamic` and keep framer-motion out of their initial bundle; the
 * colours, icon and ARIA role come from the shared `Alert` primitive.
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
          className={className}
        >
          <Alert tone={kind} title={title}>
            {message}
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
