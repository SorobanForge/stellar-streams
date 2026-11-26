'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@stellar-starter-kit/ui';
import { useTheme } from './ThemeProvider';

export interface ThemeToggleProps {
  /** Extra classes for the button, e.g. to match the surrounding header. */
  className?: string;
}

/**
 * Light/dark toggle for the dashboard chrome.
 *
 * Both icons are always rendered and Tailwind's `dark` variant decides which
 * one is visible, so the button's markup is identical on the server and during
 * hydration — the pre-paint script has already set the class, and no theme
 * state has to be guessed on the server.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const label = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      data-theme-toggle=""
      className={cn(
        'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      <Moon aria-hidden="true" className="h-4 w-4 dark:hidden" />
      <Sun aria-hidden="true" className="hidden h-4 w-4 dark:block" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

export default ThemeToggle;
