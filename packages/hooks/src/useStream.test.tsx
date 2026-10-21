import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { useStream } from './index';
import { clearRequestCache } from './request-cache';

/**
 * These tests count RPC invocations on a fake client. Two `useStream` hooks
 * mounting in the same tick with the same client and id must share a single
 * `getStream` call (and a single `claimable` call), while `refresh()` must
 * always hit the client again.
 */

const STREAM_ID = 7n;

function fakeStream(id = STREAM_ID): Stream {
  return {
    id: String(id),
    sender: 'GSENDER',
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeClient() {
  const getStream = vi.fn(async (id: bigint | number | string) => fakeStream(BigInt(id)));
  const claimable = vi.fn(async () => 42n);
  return { getStream, claimable, client: { getStream, claimable } as unknown as StreamsClient };
}

function StreamProbe({ client, id }: { client: StreamsClient | null; id: bigint }) {
  const { stream, claimable } = useStream(client, id);
  return <div data-testid="probe">{stream ? `${stream.id}:${claimable.toString()}` : 'none'}</div>;
}

function RefreshProbe({ client, id }: { client: StreamsClient | null; id: bigint }) {
  const { stream, refresh } = useStream(client, id);
  return (
    <div>
      <div data-testid="probe">{stream ? stream.id : 'none'}</div>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  );
}

describe('useStream request dedupe', () => {
  beforeEach(() => {
    clearRequestCache();
  });

  it('shares one getStream and one claimable call between concurrent hooks', async () => {
    const gate = deferred<Stream>();
    const { getStream, claimable, client } = makeClient();
    getStream.mockImplementation(() => gate.promise);

    render(
      <>
        <StreamProbe client={client} id={STREAM_ID} />
        <StreamProbe client={client} id={STREAM_ID} />
        <StreamProbe client={client} id={STREAM_ID} />
      </>,
    );

    // All three hooks are in flight before the first read settles.
    expect(getStream).toHaveBeenCalledTimes(1);
    expect(claimable).toHaveBeenCalledTimes(1);

    gate.resolve(fakeStream());
    await waitFor(() => {
      for (const probe of screen.getAllByTestId('probe')) {
        expect(probe.textContent).toBe('7:42');
      }
    });

    expect(getStream).toHaveBeenCalledTimes(1);
    expect(claimable).toHaveBeenCalledTimes(1);
  });

  it('does not share reads between different stream ids', async () => {
    const { getStream, claimable, client } = makeClient();

    render(
      <>
        <StreamProbe client={client} id={1n} />
        <StreamProbe client={client} id={2n} />
      </>,
    );

    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(2));
    expect(claimable).toHaveBeenCalledTimes(2);
  });

  it('drops the cached read once it settles so a remount refetches', async () => {
    const { getStream, client } = makeClient();

    const first = render(<StreamProbe client={client} id={STREAM_ID} />);
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('7:42'));
    expect(getStream).toHaveBeenCalledTimes(1);

    first.unmount();
    render(<StreamProbe client={client} id={STREAM_ID} />);

    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(2));
  });

  it('refresh() always bypasses the cache, even while a read is in flight', async () => {
    const gate = deferred<Stream>();
    const { getStream, client } = makeClient();
    getStream.mockImplementationOnce(() => gate.promise);

    render(<RefreshProbe client={client} id={STREAM_ID} />);
    expect(getStream).toHaveBeenCalledTimes(1);

    // The initial automatic read is still pending; a manual refresh must not
    // reuse it.
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(2));

    gate.resolve(fakeStream());
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('7'));

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() => expect(getStream).toHaveBeenCalledTimes(3));
  });

  it('surfaces an error from the shared read', async () => {
    const { getStream, client } = makeClient();
    getStream.mockRejectedValueOnce(new Error('rpc down'));

    function ErrorProbe() {
      const { error } = useStream(client, STREAM_ID);
      return <div data-testid="error">{error ?? 'none'}</div>;
    }

    render(<ErrorProbe />);
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('rpc down'));
  });
});
