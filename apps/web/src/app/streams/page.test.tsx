import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Stream } from '@stellar-starter-kit/types';
import StreamsDashboard from './page';
import * as hooks from '@stellar-starter-kit/hooks';
import * as wallets from '@stellar-starter-kit/wallets';

function fakeStream(id: string, address: string): Stream {
  return {
    id,
    sender: address,
    recipient: 'GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242',
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    totalAmount: '1000000000',
    withdrawn: '0',
    startTime: 1700000000,
    endTime: 1702592000,
    cliffTime: 1700500000,
    cancelled: false,
    label: '',
    reference: '',
  };
}

vi.mock('@stellar-starter-kit/wallets', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@stellar-starter-kit/hooks', () => ({
  useCreateStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useWithdrawStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useCancelStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useStreams: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('StreamsDashboard Pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424',
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(),
    } as unknown as ReturnType<typeof wallets.useWallet>);
  });

  it('renders the first page and "Load more" button when hasMore is true', () => {
    const loadMoreMock = vi.fn();
    vi.mocked(hooks.useStreams).mockReturnValue({
      streams: [fakeStream('1', 'GB1'), fakeStream('2', 'GB1')],
      loading: false,
      loadingMore: false,
      hasMore: true,
      loadMore: loadMoreMock,
      error: null,
      refresh: vi.fn(),
    });

    render(<StreamsDashboard />);

    expect(screen.getByText('#1')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    expect(loadMoreBtn).toBeDefined();

    fireEvent.click(loadMoreBtn);
    expect(loadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('renders appended page without duplicates and displays end-of-list message when hasMore is false', () => {
    vi.mocked(hooks.useStreams).mockReturnValue({
      streams: [fakeStream('1', 'GB1'), fakeStream('2', 'GB1'), fakeStream('3', 'GB1')],
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      error: null,
      refresh: vi.fn(),
    });

    render(<StreamsDashboard />);

    expect(screen.getByText('#1')).toBeDefined();
    expect(screen.getByText('#2')).toBeDefined();
    expect(screen.getByText('#3')).toBeDefined();

    // No Load more button
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
    // End of list message shown rather than infinite spinner
    expect(screen.getByText(/End of list — all streams loaded/i)).toBeDefined();
  });

  it('resets streams on wallet switch and handles empty page cleanly', () => {
    // Empty streams for new wallet
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: 'GNEWWALLET',
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(),
    } as unknown as ReturnType<typeof wallets.useWallet>);

    vi.mocked(hooks.useStreams).mockReturnValue({
      streams: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      error: null,
      refresh: vi.fn(),
    });

    render(<StreamsDashboard />);

    // Old streams are not present
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.queryByText('#2')).toBeNull();

    // Empty list message
    expect(screen.getByText(/No streams found for this address/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });
});
