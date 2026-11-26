'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemePreference,
} from '../../lib/theme';

interface ThemeContextValue {
  /** The explicit choice, or `system` when the user has not picked one. */
  preference: ThemePreference;
  /** The theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  /** Persist and apply an explicit choice. */
  setPreference: (preference: ThemePreference) => void;
  /** Flip between light and dark, persisting the result. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Initial preference for tests and server rendering. In the browser the
   * stored value wins; the pre-paint script has already applied it.
   */
  defaultPreference?: ThemePreference;
}

export function ThemeProvider({ children, defaultPreference = 'system' }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(defaultPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // Read the persisted choice after mount: the server cannot see localStorage,
  // and the inline script already put the right class on <html>.
  useEffect(() => {
    const stored = readStoredTheme();
    setPreferenceState(stored ?? 'system');
  }, []);

  const apply = useCallback((next: ThemePreference) => {
    const resolved = resolveTheme(next, systemPrefersDark());
    setResolvedTheme(resolved);
    applyResolvedTheme(resolved);
  }, []);

  useEffect(() => {
    apply(preference);
  }, [apply, preference]);

  // Follow the OS while no explicit choice exists, and pick up changes made in
  // another tab so the two stay consistent.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (preference === 'system') apply('system');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const stored = readStoredTheme();
      setPreferenceState(stored ?? 'system');
    };
    media.addEventListener?.('change', onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener?.('change', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [apply, preference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      persistTheme(next);
      apply(next);
    },
    [apply],
  );

  const toggleTheme = useCallback(() => {
    const next = resolveTheme(preference, systemPrefersDark()) === 'dark' ? 'light' : 'dark';
    setPreference(next);
  }, [preference, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the current theme. Throws outside a `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }
  return context;
}
