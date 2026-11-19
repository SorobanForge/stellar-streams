import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StreamsDashboard from './page';
import { useWallet } from '@stellar-starter-kit/wallets';
import { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';

vi.mock('@stellar-starter-kit/wallets', () => ({
  useWallet: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => {
    return function MockDynamic({ kind, message }: { kind: string | null; message: string }) {
      if (!kind) return null;
      return (
        <div data-testid="notification-banner" data-kind={kind}>
          {message}
        </div>
      );
    };
  },
}));

describe('StreamsDashboard - Pause and Resume controls (Issue #349)', () => {
  const SENDER = 'GSENDER1111111111111111111111111111111111111111111111111';
  const RECIPIENT = 'GRECIPIENT222222222222222222222222222222222222222222222222';
  const NOW = 1_700_010_000;

  const runningStream: Stream = {
    id: '1',
    sender: SENDER,
    recipient: RECIPIENT,
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    totalAmount: '1000000000',
    withdrawn: '0',
    startTime: NOW - 500,
    endTime: NOW + 1_000,
    cliffTime: NOW - 500,
    label: 'Payroll',
    reference: 'REF-1',
    cancelled: false,
    pausedAt: null,
    totalPaused: 0,
  };

  const pausedStream: Stream = {
    id: '2',
    sender: SENDER,
    recipient: RECIPIENT,
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    totalAmount: '1000000000',
    withdrawn: '0',
    startTime: NOW - 1_000,
    endTime: NOW + 2_000,
    cliffTime: NOW - 1_000,
    label: 'Grant',
    reference: 'REF-2',
    cancelled: false,
    pausedAt: NOW - 120,
    totalPaused: 60,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(StreamsClient.prototype, 'getStream').mockImplementation(
      async (id: bigint | number | string) => {
        if (String(id) === '1') return runningStream;
        if (String(id) === '2') return pausedStream;
        return null;
      },
    );
    vi.spyOn(StreamsClient.prototype, 'claimable').mockImplementation(async () => 500_000_000n);
    vi.spyOn(StreamsClient.prototype, 'getTokenMetadata').mockImplementation(async () => ({
      contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      decimals: 7,
      symbol: 'XLM',
    }));
    vi.spyOn(StreamsClient.prototype, 'getConfig').mockImplementation(async () => ({
      admin: SENDER,
      treasury: SENDER,
      feeBps: 0,
    }));
    vi.spyOn(StreamsClient.prototype, 'pause').mockImplementation(async () => ({
      hash: 'tx-pause-hash-12345',
    }));
    vi.spyOn(StreamsClient.prototype, 'resume').mockImplementation(async () => ({
      hash: 'tx-resume-hash-67890',
    }));
    vi.spyOn(StreamsClient.prototype, 'cancel').mockImplementation(async () => ({
      hash: 'tx-cancel-hash',
    }));
    vi.spyOn(StreamsClient.prototype, 'withdraw').mockImplementation(async () => ({
      hash: 'tx-withdraw-hash',
    }));

    (useWallet as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeAddress: SENDER,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(async () => 'signed-xdr'),
    });
  });

  it('renders Pause button for sender on a running stream and mutates successfully', async () => {
    render(<StreamsDashboard />);

    const idInput = screen.getByPlaceholderText('Stream id');
    fireEvent.change(idInput, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #1')).toBeTruthy();
    });

    // Sender should see Pause button, but NOT Resume button
    const pauseButton = screen.getByRole('button', { name: /^pause$/i }) as HTMLButtonElement;
    expect(pauseButton).toBeTruthy();
    expect(pauseButton.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /^resume$/i })).toBeNull();

    // Accumulated pause time should be shown (0s)
    expect(screen.getByText(/paused time/i)).toBeTruthy();

    // Click Pause
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(StreamsClient.prototype.pause).toHaveBeenCalledWith('1');
      expect(screen.getByTestId('notification-banner').textContent).toMatch(
        /pause submitted successfully/i,
      );
    });
  });

  it('renders Resume button for sender on a paused stream, shows paused state and accumulated pause time', async () => {
    render(<StreamsDashboard />);

    const idInput = screen.getByPlaceholderText('Stream id');
    fireEvent.change(idInput, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #2')).toBeTruthy();
    });

    // Sender should see Resume button, but NOT Pause button
    const resumeButton = screen.getByRole('button', { name: /^resume$/i }) as HTMLButtonElement;
    expect(resumeButton).toBeTruthy();
    expect(resumeButton.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /^pause$/i })).toBeNull();

    // Status badge shows paused
    expect(screen.getByText('Paused')).toBeTruthy();

    // Paused time should show accumulated pause duration
    expect(screen.getByText(/paused time/i)).toBeTruthy();

    // Click Resume
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(StreamsClient.prototype.resume).toHaveBeenCalledWith('2');
      expect(screen.getByTestId('notification-banner').textContent).toMatch(
        /resume submitted successfully/i,
      );
    });
  });

  it('does not render Pause or Resume buttons for recipient', async () => {
    (useWallet as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeAddress: RECIPIENT,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(),
    });

    render(<StreamsDashboard />);

    const idInput = screen.getByPlaceholderText('Stream id');

    // Check running stream
    fireEvent.change(idInput, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #1')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /^pause$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^resume$/i })).toBeNull();

    // Check paused stream
    fireEvent.change(idInput, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #2')).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /^pause$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^resume$/i })).toBeNull();
  });

  it('disables controls while a mutation is pending', async () => {
    let resolvePause: (val: { hash: string }) => void = () => {};
    const pausePromise = new Promise<{ hash: string }>((res) => {
      resolvePause = res;
    });
    vi.spyOn(StreamsClient.prototype, 'pause').mockReturnValue(pausePromise);

    render(<StreamsDashboard />);

    const idInput = screen.getByPlaceholderText('Stream id');
    fireEvent.change(idInput, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #1')).toBeTruthy();
    });

    const pauseButton = screen.getByRole('button', { name: /^pause$/i }) as HTMLButtonElement;
    fireEvent.click(pauseButton);

    // Button is disabled while pending
    await waitFor(() => {
      expect(pauseButton.disabled).toBe(true);
    });

    // Resolve the mutation
    resolvePause({ hash: 'tx-done' });

    await waitFor(() => {
      expect(pauseButton.disabled).toBe(false);
    });
  });

  it('reports transaction error when pause mutation fails', async () => {
    vi.spyOn(StreamsClient.prototype, 'pause').mockRejectedValue(
      new Error('Contract error: unauthorized'),
    );

    render(<StreamsDashboard />);

    const idInput = screen.getByPlaceholderText('Stream id');
    fireEvent.change(idInput, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('Stream #1')).toBeTruthy();
    });

    const pauseButton = screen.getByRole('button', { name: /^pause$/i });
    fireEvent.click(pauseButton);

    await waitFor(() => {
      expect(screen.getByTestId('notification-banner').textContent).toMatch(
        /Contract error: unauthorized/i,
      );
    });
  });
});
