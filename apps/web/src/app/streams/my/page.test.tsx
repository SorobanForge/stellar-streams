import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import type { Stream } from '@stellar-starter-kit/types';
import type { UseStreamsResult } from '@stellar-starter-kit/hooks';
import { useWallet } from '@stellar-starter-kit/wallets';
import { useStreams } from '@stellar-starter-kit/hooks';
import { MyStreams } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@stellar-starter-kit/wallets', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@stellar-starter-kit/hooks', () => ({
  useStreams: vi.fn(),
}));

const RECIPIENT = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424';
const SENDER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER = 'GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242';
const CONTRACT = 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

const config: EnvironmentConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  expertUrl: 'https://stellar.expert/explorer/testnet',
  streamContractId: CONTRACT,
  splitsContractId: undefined,
  escrowContractId: undefined,
  tokenContractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};

function stream(overrides: Partial<Stream> & { id: string }): Stream {
  return {
    sender: SENDER,
    recipient: RECIPIENT,
    token: config.tokenContractId,
    totalAmount: '5000000000',
    withdrawn: '0',
    startTime: 1700000000,
    endTime: 1705000000,
    cliffTime: 1700000000,
    cancelled: false,
    label: 'Q4 payroll',
    reference: '',
    ...overrides,
  };
}

function listing(overrides: Partial<UseStreamsResult> = {}): UseStreamsResult {
  return {
    streams: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    cursor: undefined,
    error: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    loadMore: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  vi.mocked(useWallet).mockReturnValue({
    activeAddress: RECIPIENT,
    isConnected: true,
    isConnecting: false,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWallet>);
}

beforeEach(() => {
  vi.mocked(useStreams).mockReset();
  mockWallet();
  vi.stubEnv('NEXT_PUBLIC_STREAM_CONTRACT_ID', CONTRACT);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MyStreams inbox', () => {
  it('lists only the streams where the connected wallet is the recipient', () => {
    vi.mocked(useStreams).mockReturnValue(
      listing({
        streams: [
          stream({ id: '1' }),
          stream({ id: '2', recipient: OTHER, label: 'Someone else' }),
          stream({ id: '3', recipient: RECIPIENT, label: 'Grant tranche' }),
        ],
      }),
    );

    render(<MyStreams config={config} />);

    expect(screen.getByText('Stream #1')).toBeDefined();
    expect(screen.getByText('Stream #3')).toBeDefined();
    expect(screen.queryByText('Stream #2')).toBeNull();
    expect(screen.getByText('2 streams sent to you')).toBeDefined();
    expect(screen.getByText('Q4 payroll')).toBeDefined();
    expect(screen.getByText('Grant tranche')).toBeDefined();
  });

  it('renders the page shell immediately while the event scan is loading', () => {
    vi.mocked(useStreams).mockReturnValue(listing({ loading: true }));

    render(<MyStreams config={config} />);

    // The heading and wallet bar are painted before the scan resolves.
    expect(screen.getByRole('heading', { name: 'My streams' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('Scanning recent ledgers');
    expect(screen.queryByText(/No streams sent to this wallet/)).toBeNull();
  });

  it('queries the SDK with the connected address so the listing stays wallet-bound', () => {
    vi.mocked(useStreams).mockReturnValue(listing());

    render(<MyStreams config={config} />);

    const [client, address] = vi.mocked(useStreams).mock.calls.at(-1) ?? [];
    expect(client).not.toBeNull();
    expect(address).toBe(RECIPIENT);
  });

  it('shows the empty state and can scan further back when events remain', () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useStreams).mockReturnValue(listing({ hasMore: true, loadMore }));

    render(<MyStreams config={config} />);

    expect(screen.getByText('No streams sent to this wallet in the scanned ledgers')).toBeDefined();
    const button = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(button);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the RPC error and retries the scan from the latest ledger', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useStreams).mockReturnValue(
      listing({ error: 'Failed to fetch events: connection refused', refresh }),
    );

    render(<MyStreams config={config} />);

    expect(screen.getByText('Could not load your streams')).toBeDefined();
    expect(screen.getByText('Failed to fetch events: connection refused')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded streams visible and disables Load more while a page is in flight', () => {
    vi.mocked(useStreams).mockReturnValue(
      listing({ streams: [stream({ id: '7' })], hasMore: true, loadingMore: true }),
    );

    render(<MyStreams config={config} />);

    expect(screen.getByText('Stream #7')).toBeDefined();
    const button = screen.getByRole('button', { name: /loading more streams/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('prompts for a wallet without requesting anything before one is connected', () => {
    mockWallet({ activeAddress: undefined, isConnected: false });
    vi.mocked(useStreams).mockReturnValue(listing());

    render(<MyStreams config={config} />);

    expect(screen.getByText('Connect your wallet')).toBeDefined();
    expect(screen.queryByText(/No streams sent to this wallet/)).toBeNull();
    const [, address] = vi.mocked(useStreams).mock.calls.at(-1) ?? [];
    expect(address).toBeUndefined();
  });

  it('shows the configuration notice instead of scanning when no contract is set', () => {
    vi.stubEnv('NEXT_PUBLIC_STREAM_CONTRACT_ID', '');
    vi.mocked(useStreams).mockReturnValue(listing());

    render(<MyStreams config={config} />);

    expect(screen.getByText('Stream contract not configured')).toBeDefined();
    const [client] = vi.mocked(useStreams).mock.calls.at(-1) ?? [];
    expect(client).toBeNull();
  });
});
