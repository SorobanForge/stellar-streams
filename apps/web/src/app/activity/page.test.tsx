import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import { useWallet } from '@stellar-starter-kit/wallets';
import { ActivityHistory } from './page';
import type { ActivityEntry } from '../../lib/horizon-activity';

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

const ACCOUNT = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFDAGORAc3LM2T2NY2424';
const HASH = 'deadbeef';

const config: EnvironmentConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  expertUrl: 'https://stellar.expert/explorer/testnet',
  streamContractId: 'CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
  splitsContractId: undefined,
  escrowContractId: undefined,
  tokenContractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: '1',
    kind: 'payment',
    type: 'payment',
    createdAt: '2026-11-23T12:34:56Z',
    transactionHash: HASH,
    sourceAccount: ACCOUNT,
    successful: true,
    title: 'Payment received',
    detail: 'From GC2B262OCPB4IA7CBZ77GLL7CQK7747754S727772656372657424242',
    amount: '10.0000000 XLM',
    ...overrides,
  };
}

type FetchPage = NonNullable<React.ComponentProps<typeof ActivityHistory>['fetchPage']>;

function fakeFetchPage() {
  return vi.fn<FetchPage>();
}

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  vi.mocked(useWallet).mockReturnValue({
    activeAddress: ACCOUNT,
    isConnected: true,
    isConnecting: false,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    signTransaction: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWallet>);
}

beforeEach(() => {
  mockWallet();
});

describe('ActivityHistory', () => {
  it('does not request Horizon until a wallet is connected', () => {
    mockWallet({ activeAddress: undefined, isConnected: false });
    const fetchPage = fakeFetchPage();

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(screen.getByText('Connect your wallet')).toBeDefined();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('lists operations newest-first with explorer links', async () => {
    const fetchPage = fakeFetchPage().mockResolvedValue({
      entries: [
        entry(),
        entry({
          id: '2',
          kind: 'contract',
          type: 'invoke_host_function',
          title: 'Contract invocation',
          detail: 'Contract invoke contract on CAAAA',
          amount: undefined,
          transactionHash: 'cafebabe',
        }),
      ],
      nextCursor: null,
    });

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(await screen.findByText('Payment received')).toBeDefined();
    expect(screen.getByText('Contract invocation')).toBeDefined();
    expect(screen.getByText('10.0000000 XLM')).toBeDefined();
    expect(screen.getAllByText('2026-11-23 12:34 UTC')).toHaveLength(2);

    const links = screen.getAllByRole('link', { name: /view on explorer/i });
    expect(links[0]!.getAttribute('href')).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
    expect(links[1]!.getAttribute('href')).toBe(
      'https://stellar.expert/explorer/testnet/tx/cafebabe',
    );

    expect(fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({
        horizonUrl: config.horizonUrl,
        address: ACCOUNT,
      }),
    );
    expect(screen.getByText('End of activity')).toBeDefined();
  });

  it('appends the next page when Load more is clicked', async () => {
    const fetchPage = fakeFetchPage()
      .mockResolvedValueOnce({ entries: [entry()], nextCursor: 'cursor-1' })
      .mockResolvedValueOnce({
        entries: [entry({ id: '2', title: 'Payment sent', transactionHash: 'second' })],
        nextCursor: null,
      });

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(await screen.findByText('Payment received')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Payment sent')).toBeDefined();
    expect(screen.getByText('Payment received')).toBeDefined();
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    expect(screen.getByText('End of activity')).toBeDefined();
  });

  it('shows an inline Horizon error and retries from the newest operation', async () => {
    const fetchPage = fakeFetchPage()
      .mockRejectedValueOnce(new Error('Horizon request failed (503 Service Unavailable).'))
      .mockResolvedValueOnce({ entries: [entry()], nextCursor: null });

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(await screen.findByText('Could not load activity')).toBeDefined();
    expect(screen.getByText('Horizon request failed (503 Service Unavailable).')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByText('Payment received')).toBeDefined();
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('keeps loaded rows visible when loading more fails', async () => {
    const fetchPage = fakeFetchPage()
      .mockResolvedValueOnce({ entries: [entry()], nextCursor: 'cursor-1' })
      .mockRejectedValueOnce(new Error('Horizon timed out.'));

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(await screen.findByText('Payment received')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('Could not load more activity')).toBeDefined();
    expect(screen.getByText('Horizon timed out.')).toBeDefined();
    expect(screen.getByText('Payment received')).toBeDefined();
  });

  it('shows the empty state when Horizon has no matching operations', async () => {
    const fetchPage = fakeFetchPage().mockResolvedValue({ entries: [], nextCursor: null });

    render(<ActivityHistory config={config} fetchPage={fetchPage} />);

    expect(
      await screen.findByText("No payments or contract calls in this account's Horizon history"),
    ).toBeDefined();
  });
});
