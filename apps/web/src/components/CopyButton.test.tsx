import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

describe('CopyButton', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });
    vi.restoreAllMocks();
  });

  it('copies the value and shows the Copied feedback state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<CopyButton value="GABC123" label="recipient address" />);
    const button = screen.getByRole('button', { name: 'Copy recipient address' });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith('GABC123');
    expect(screen.getByRole('button', { name: 'Copied recipient address' })).toBe(button);
    expect(button.getAttribute('data-copied')).toBe('true');
    expect(screen.getByText('Copied')).toBeTruthy();
  });

  it('falls back to execCommand when the Clipboard API is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    render(<CopyButton value="abcd1234" label="transaction hash" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }));
    });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText('Copied')).toBeTruthy();
    // The scratch textarea used for the fallback is removed again.
    expect(document.querySelector('textarea')).toBeNull();
  });
});
