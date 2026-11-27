import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CopyButton from './CopyButton';

const SAMPLE_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424';
const SAMPLE_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('CopyButton', () => {
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      });
    }
    document.execCommand = originalExecCommand;
  });

  it('copies via Clipboard API, names what was copied, and resets state', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<CopyButton value={SAMPLE_ADDRESS} label="recipient address" resetMs={1500} />);

    const button = screen.getByRole('button', { name: 'Copy recipient address' });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SAMPLE_ADDRESS);
    expect(screen.getByText('Copied')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copied recipient address' })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByText('Copied')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy recipient address' })).toBeDefined();
  });

  it('falls back to execCommand when navigator.clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<CopyButton value={SAMPLE_HASH} label="transaction hash" />);

    const button = screen.getByRole('button', { name: 'Copy transaction hash' });
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText('Copied')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copied transaction hash' })).toBeDefined();
  });

  it('falls back to execCommand when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<CopyButton value={SAMPLE_ADDRESS} label="contract id" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy contract id' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(SAMPLE_ADDRESS);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText('Copied')).toBeDefined();
  });
});
