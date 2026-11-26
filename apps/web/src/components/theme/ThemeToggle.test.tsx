import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { THEME_STORAGE_KEY } from '../../lib/theme';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

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

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('ThemeToggle', () => {
  it('starts from the system preference and switches to dark', async () => {
    renderToggle();

    const toggle = await screen.findByRole('button', { name: 'Switch to dark theme' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeDefined();
  });

  it('applies a persisted dark choice on mount', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    renderToggle();

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeDefined();
  });

  it('persists a switch back to light', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderToggle();

    const toggle = await screen.findByRole('button', { name: 'Switch to light theme' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('uses the dark system preference when no choice is stored', async () => {
    stubMatchMedia(true);

    renderToggle();

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('renders both icons so the visible one follows the CSS dark variant', async () => {
    renderToggle();

    await screen.findByRole('button');
    const darkIcon = document.querySelector('.dark\\:block');
    expect(darkIcon).not.toBeNull();
    expect(darkIcon?.getAttribute('aria-hidden')).toBe('true');
  });
});
