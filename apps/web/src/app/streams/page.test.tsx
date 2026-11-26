import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Stream } from '@stellar-starter-kit/types';
import StreamsDashboard from './page';
import * as streamCsv from '../../lib/stream-csv';
import * as hooks from '@stellar-starter-kit/hooks';
import * as wallets from '@stellar-starter-kit/wallets';
import { StreamsClient } from '@stellar-starter-kit/sdk';

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
    pausedAt: null,
    totalPaused: 0,
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

vi.mock('@stellar-starter-kit/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar-starter-kit/hooks')>();
  return {
    ...actual,
    useStreams: vi.fn(() => ({
      streams: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      error: null,
      refresh: vi.fn(),
    })),
  };
});

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
    pausedAt: null,
    totalPaused: 0,
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

    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: SENDER,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(async () => 'signed-xdr'),
    } as unknown as ReturnType<typeof wallets.useWallet>);
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
    vi.mocked(wallets.useWallet).mockReturnValue({
      activeAddress: RECIPIENT,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      signTransaction: vi.fn(),
    } as unknown as ReturnType<typeof wallets.useWallet>);

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
