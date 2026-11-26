import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyResolvedTheme,
  isThemePreference,
  persistTheme,
  readStoredTheme,
  resolveTheme,
} from './theme';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  window.localStorage.clear();
});

describe('resolveTheme', () => {
  it('returns an explicit preference unchanged', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system preference when unset', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('isThemePreference', () => {
  it('accepts only the supported values', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe('stored preference', () => {
  it('reads an explicit choice and ignores an unknown value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');

    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme()).toBeNull();
  });

  it('treats a stored system value as no explicit choice', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(readStoredTheme()).toBeNull();
  });

  it('persists and clears the explicit choice', () => {
    persistTheme('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    persistTheme('system');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe('applyResolvedTheme', () => {
  it('toggles the dark class and colour scheme on the root element', () => {
    applyResolvedTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyResolvedTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('THEME_INIT_SCRIPT', () => {
  const run = () => {
    // The script is injected as an inline <script>; evaluating it directly
    // exercises exactly what the browser runs before paint.
    new Function(THEME_INIT_SCRIPT)();
  };

  it('applies a stored dark choice before first paint', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    stubMatchMedia(false);

    run();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('respects a stored light choice even when the system is dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    stubMatchMedia(true);

    run();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('uses the system preference when nothing is stored', () => {
    stubMatchMedia(true);

    run();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to light without matchMedia and never throws', () => {
    vi.stubGlobal('matchMedia', undefined);

    run();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
