import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Stream } from '@stellar-starter-kit/types';
import StreamsDashboard from './page';
import * as streamCsv from '../../lib/stream-csv';
import * as hooks from '@stellar-starter-kit/hooks';
import * as wallets from '@stellar-starter-kit/wallets';

const mockActiveAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424';

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

// Mock dependencies
vi.mock('@stellar-starter-kit/wallets', () => ({
  useWallet: vi.fn(() => ({
    activeAddress: mockActiveAddress,
    isConnected: true,
    isConnecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
  })),
}));

vi.mock('@stellar-starter-kit/hooks', () => ({
  useCreateStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useWithdrawStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useCancelStream: vi.fn(() => ({ status: 'idle', mutate: vi.fn() })),
  useStreams: vi.fn(() => ({
    streams: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: null,
    refresh: vi.fn(),
  })),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

// The header hosts the theme toggle, which needs the app's ThemeProvider; the
// header chrome is not what these tests exercise.
vi.mock('../../components/AppHeader', () => ({
  AppHeader: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('StreamsDashboard Contract Configuration', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: mockActiveAddress,
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
  });

  describe('when stream contract is unconfigured', () => {
    it('renders setup notice naming NEXT_PUBLIC_STREAM_CONTRACT_ID and linking to development-guide.md', () => {
      render(<StreamsDashboard contractId="" />);

      // Notice paragraph is visible
      const noticeHeading = screen.getByText('Stream contract not configured', { selector: 'p' });
      expect(noticeHeading).toBeDefined();

      // Names the environment variable
      expect(screen.getAllByText('NEXT_PUBLIC_STREAM_CONTRACT_ID').length).toBeGreaterThan(0);

      // Links to docs/development-guide.md
      const docsLink = screen.getByRole('link', { name: /docs\/development-guide\.md/i });
      expect(docsLink).toBeDefined();
      expect(docsLink.getAttribute('href')).toContain('docs/development-guide.md');
    });

    it('disables the create form and shows an explanation instead of a dead button', () => {
      render(<StreamsDashboard contractId="" />);

      // Inputs should be disabled
      const recipientInput = screen.getByRole('textbox', { name: /recipient/i });
      const tokenInput = screen.getByRole('textbox', { name: /token contract/i });
      const amountInput = screen.getByRole('spinbutton', { name: /amount/i });
      const durationInput = screen.getByRole('spinbutton', { name: /duration/i });
      const cliffInput = screen.getByRole('spinbutton', { name: /cliff/i });

      expect(recipientInput.hasAttribute('disabled')).toBe(true);
      expect(tokenInput.hasAttribute('disabled')).toBe(true);
      expect(amountInput.hasAttribute('disabled')).toBe(true);
      expect(durationInput.hasAttribute('disabled')).toBe(true);
      expect(cliffInput.hasAttribute('disabled')).toBe(true);

      // Submit button is disabled and displays explanation
      const submitButton = screen.getByRole('button', { name: 'Stream contract not configured' });
      expect(submitButton).toBeDefined();
      expect(submitButton.hasAttribute('disabled')).toBe(true);

      // Helper explanation text is rendered
      const explanation = screen.getByText(
        (_, el) =>
          el?.tagName.toLowerCase() === 'p' &&
          Boolean(
            el?.textContent?.includes(
              'Set NEXT_PUBLIC_STREAM_CONTRACT_ID to enable stream creation.',
            ),
          ),
      );
      expect(explanation).toBeDefined();
    });

    it('detects unconfigured contract from NEXT_PUBLIC_STREAM_CONTRACT_ID environment variable', () => {
      vi.stubEnv('NEXT_PUBLIC_STREAM_CONTRACT_ID', '');
      render(<StreamsDashboard />);

      expect(screen.getByText('Stream contract not configured', { selector: 'p' })).toBeDefined();
      const submitButton = screen.getByRole('button', { name: 'Stream contract not configured' });
      expect(submitButton.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('when stream contract is configured', () => {
    it('does not render setup notice and enables create form inputs', () => {
      render(
        <StreamsDashboard contractId="CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ" />,
      );

      // Notice should NOT be rendered
      expect(screen.queryByText('Stream contract not configured', { selector: 'p' })).toBeNull();
      expect(screen.queryByRole('link', { name: /docs\/development-guide\.md/i })).toBeNull();

      // Form inputs should NOT be disabled
      const recipientInput = screen.getByRole('textbox', { name: /recipient/i });
      const tokenInput = screen.getByRole('textbox', { name: /token contract/i });
      const amountInput = screen.getByRole('spinbutton', { name: /amount/i });
      const durationInput = screen.getByRole('spinbutton', { name: /duration/i });
      const cliffInput = screen.getByRole('spinbutton', { name: /cliff/i });

      expect(recipientInput.hasAttribute('disabled')).toBe(false);
      expect(tokenInput.hasAttribute('disabled')).toBe(false);
      expect(amountInput.hasAttribute('disabled')).toBe(false);
      expect(durationInput.hasAttribute('disabled')).toBe(false);
      expect(cliffInput.hasAttribute('disabled')).toBe(false);

      // Submit button should have standard text "Create stream", not the unconfigured notice
      expect(screen.queryByRole('button', { name: 'Stream contract not configured' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Create stream' })).toBeDefined();

      // Helper explanation text should not be present
      expect(
        screen.queryByText(
          (_, el) =>
            el?.tagName.toLowerCase() === 'p' &&
            Boolean(
              el?.textContent?.includes(
                'Set NEXT_PUBLIC_STREAM_CONTRACT_ID to enable stream creation.',
              ),
            ),
        ),
      ).toBeNull();
    });

    it('detects configured contract from NEXT_PUBLIC_STREAM_CONTRACT_ID environment variable', () => {
      vi.stubEnv(
        'NEXT_PUBLIC_STREAM_CONTRACT_ID',
        'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
      );
      render(<StreamsDashboard />);

      expect(screen.queryByText('Stream contract not configured', { selector: 'p' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Create stream' })).toBeDefined();
    });
  });
});

describe('StreamsDashboard Export CSV', () => {
  const sampleStream: Stream = {
    id: '101',
    sender: mockActiveAddress,
    recipient: 'GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242',
    token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    totalAmount: '5000000000', // 500 XLM
    withdrawn: '1000000000', // 100 XLM
    startTime: 1700000000,
    endTime: 1705000000,
    cliffTime: 1701000000,
    cancelled: false,
    label: 'Q4 Payroll',
    reference: 'PAY-101',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: mockActiveAddress,
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
  });

  it('renders Export CSV button as disabled when there are no loaded streams', () => {
    render(<StreamsDashboard initialStreams={[]} />);

    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    expect(exportBtn).toBeDefined();
    expect(exportBtn.hasAttribute('disabled')).toBe(true);
  });

  it('enables Export CSV button when streams are loaded and triggers download on click', () => {
    const downloadSpy = vi.spyOn(streamCsv, 'downloadCsv').mockImplementation(() => {});

    render(<StreamsDashboard initialStreams={[sampleStream]} />);

    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    expect(exportBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(exportBtn);

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [filename, csvContent] = downloadSpy.mock.calls[0];

    // Assert file name includes network and connected address
    expect(filename).toContain('testnet');
    expect(filename).toContain(mockActiveAddress);
    expect(filename).toMatch(/^streams-testnet-GBRPY.*\.csv$/);

    // Assert header row and data row
    const lines = csvContent.split('\r\n');
    expect(lines[0]).toBe(
      'id,sender,recipient,token,totalAmountRaw,totalAmountFormatted,withdrawnRaw,withdrawnFormatted,startTime,endTime,cliffTime,cancelled,label,reference',
    );

    const dataCols = lines[1].split(',');
    expect(dataCols[0]).toBe('101');
    expect(dataCols[1]).toBe(mockActiveAddress);
    expect(dataCols[4]).toBe('5000000000'); // raw stroops
    expect(dataCols[5]).toBe('500'); // formatted amount
    expect(dataCols[6]).toBe('1000000000'); // raw withdrawn
    expect(dataCols[7]).toBe('100'); // formatted withdrawn
  });

  it('renders stream details in the table', () => {
    render(<StreamsDashboard initialStreams={[sampleStream]} />);

    expect(screen.getByText('#101')).toBeDefined();
    expect(screen.getByText('500 XLM')).toBeDefined();
    expect(screen.getByText('100 XLM')).toBeDefined();
  });
});

describe('StreamsDashboard Pagination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: mockActiveAddress,
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
