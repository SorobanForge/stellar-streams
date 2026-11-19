import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useStreams } from './index';

function fakeStream(id: string, address: string): Stream {
  return {
    id,
    sender: address,
    recipient: 'GRECIPIENT',
    token: 'GTOKEN',
    totalAmount: '1000',
    withdrawn: '0',
    startTime: 0,
    endTime: 100,
    cliffTime: 0,
    label: '',
    reference: '',
    cancelled: false,
  };
}

function StreamsProbe({
  client,
  address,
}: {
  client: StreamsClient | null;
  address: string | null;
}) {
  const { streams, loading, loadingMore, hasMore, loadMore, cursor } = useStreams(client, address);

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="loading-more">{loadingMore ? 'loading-more' : 'idle'}</div>
      <div data-testid="has-more">{hasMore ? 'has-more' : 'no-more'}</div>
      <div data-testid="cursor">{cursor ?? 'no-cursor'}</div>
      <ul data-testid="stream-list">
        {streams.map((s) => (
          <li key={s.id} data-testid={`stream-${s.id}`}>
            {s.id}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button data-testid="load-more-btn" onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </div>
  );
}

describe('useStreams pagination', () => {
  it('loads first page with cursor, appends page without duplicates, and resets on wallet switch', async () => {
    const listStreams = vi.fn(async ({ address, cursor }: { address: string; cursor?: string }) => {
      if (address === 'GUSER1') {
        if (!cursor) {
          return {
            streams: [fakeStream('1', address), fakeStream('2', address)],
            cursor: 'cursor-page-2',
          };
        }
        if (cursor === 'cursor-page-2') {
          return {
            // Include duplicate ID 2 to verify deduplication
            streams: [fakeStream('2', address), fakeStream('3', address)],
            cursor: undefined,
          };
        }
      }
      if (address === 'GUSER2') {
        return {
          streams: [fakeStream('99', address)],
          cursor: undefined,
        };
      }
      return { streams: [], cursor: undefined };
    });

    const client = { listStreams } as unknown as StreamsClient;

    // 1. Initial mount with GUSER1
    const { rerender } = render(<StreamsProbe client={client} address="GUSER1" />);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('idle');
    });

    expect(screen.getByTestId('cursor').textContent).toBe('cursor-page-2');
    expect(screen.getByTestId('has-more').textContent).toBe('has-more');
    expect(screen.getByTestId('stream-1')).toBeDefined();
    expect(screen.getByTestId('stream-2')).toBeDefined();
    expect(screen.queryByTestId('stream-3')).toBeNull();

    // 2. Load more (second page)
    const loadMoreBtn = screen.getByTestId('load-more-btn');
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByTestId('stream-3')).toBeDefined();
    });

    // Deduplication check: stream-2 should appear only once in the list
    const items = screen.getAllByTestId(/stream-\d+/);
    expect(items.length).toBe(3); // 1, 2, 3
    expect(screen.getByTestId('has-more').textContent).toBe('no-more');
    expect(screen.getByTestId('cursor').textContent).toBe('no-cursor');

    // 3. Wallet switch to GUSER2
    rerender(<StreamsProbe client={client} address="GUSER2" />);

    await waitFor(() => {
      expect(screen.getByTestId('stream-99')).toBeDefined();
    });

    // Old streams from GUSER1 should be gone
    expect(screen.queryByTestId('stream-1')).toBeNull();
    expect(screen.queryByTestId('stream-2')).toBeNull();
    expect(screen.queryByTestId('stream-3')).toBeNull();
    expect(screen.getByTestId('cursor').textContent).toBe('no-cursor');
    expect(screen.getByTestId('has-more').textContent).toBe('no-more');
  });

  it('handles empty response gracefully without infinite spinner', async () => {
    const listStreams = vi.fn(async () => ({ streams: [], cursor: undefined }));
    const client = { listStreams } as unknown as StreamsClient;

    render(<StreamsProbe client={client} address="GEMPTY" />);

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('idle');
    });

    expect(screen.getByTestId('has-more').textContent).toBe('no-more');
    expect(screen.getByTestId('cursor').textContent).toBe('no-cursor');
    expect(screen.queryByTestId('load-more-btn')).toBeNull();
  });
});
