/**
 * Theme preference handling shared by the server-rendered root layout and the
 * client provider.
 *
 * The theme is a class on `<html>` (`dark` present = dark), so Tailwind's
 * `dark:` variant and the CSS variables in `globals.css` switch together. The
 * explicit choice lives in `localStorage`; without one the system preference
 * applies, which is also what the pre-paint script in `layout.tsx` resolves so
 * the first paint never flashes the wrong theme.
 */
export const THEME_STORAGE_KEY = 'stellar-streams-theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Narrow an arbitrary stored value to a preference the app understands. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && PREFERENCES.includes(value as ThemePreference);
}

/** Resolve an explicit preference, falling back to the system setting. */
export function resolveTheme(
  preference: ThemePreference | null | undefined,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return prefersDark ? 'dark' : 'light';
}

/** The saved preference, or `null` when the user has not chosen one yet. */
export function readStoredTheme(): ThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) && stored !== 'system' ? stored : null;
  } catch {
    // Storage can be blocked (private mode, disabled cookies); the system
    // preference still applies, so a failure to read is not an error.
    return null;
  }
}

/** Persist an explicit choice. `null` clears it so the system applies again. */
export function persistTheme(preference: ThemePreference | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (preference === null || preference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // A blocked storage API only costs persistence, not the current theme.
  }
}

/** Whether the operating system asks for a dark UI. */
export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Apply a resolved theme to the document before/after paint. */
export function applyResolvedTheme(
  theme: ResolvedTheme,
  root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement,
): void {
  if (!root) return;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  // Keeps native form controls and scrollbars in the same mode as the page.
  root.style.colorScheme = theme;
}

/**
 * The inline script injected into `<head>`.
 *
 * It must be a self-contained string: it runs before React (or any module)
 * loads and before the browser paints, so a stored or system dark theme is on
 * `<html>` on the very first frame. The try/catch keeps a blocked
 * `localStorage` from breaking the page, and a missing `matchMedia` (very old
 * browsers, some test environments) falls back to light.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var key=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var stored=window.localStorage.getItem(key);var dark=!!(stored==='dark'||(stored!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches));var root=document.documentElement;root.classList.toggle('dark',dark);root.dataset.theme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';}catch(e){}})();`;
