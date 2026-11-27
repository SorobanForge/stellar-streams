import React from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamsClient, TokenMetadata } from '@stellar-starter-kit/sdk';
import { clearTokenMetadataCache, useTokenMetadata } from './index';

const USDC_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
const XLM_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function makeMeta(contractId: string, decimals = 6, symbol = 'USDC'): TokenMetadata {
  return { contractId, decimals, symbol };
}

function makeClient(
  impl: (tokenId: string) => Promise<TokenMetadata> = async (tokenId) => makeMeta(tokenId),
) {
  const getTokenMetadata = vi.fn(impl);
  return {
    getTokenMetadata,
    client: { getTokenMetadata } as unknown as StreamsClient,
  };
}

function TokenProbe({
  client,
  tokenId,
}: {
  client: StreamsClient | null;
  tokenId?: string | null;
}) {
  const { metadata, loading, error } = useTokenMetadata(client, tokenId);
  return (
    <div data-testid="token-probe">
      {loading ? 'loading' : error ? `error:${error}` : metadata ? metadata.symbol : 'null'}
    </div>
  );
}

describe('useTokenMetadata', () => {
  beforeEach(() => {
    clearTokenMetadataCache();
  });

  it('loads metadata on a cache miss and resolves loading state', async () => {
    const meta = makeMeta(USDC_ID, 6, 'USDC');
    const { getTokenMetadata, client } = makeClient(async () => meta);

    const { result } = renderHook(() => useTokenMetadata(client, USDC_ID));

    expect(result.current.loading).toBe(true);
    expect(result.current.metadata).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.metadata).toEqual(meta);
    expect(result.current.error).toBeNull();
    expect(getTokenMetadata).toHaveBeenCalledTimes(1);
    expect(getTokenMetadata).toHaveBeenCalledWith(USDC_ID);
  });

  it('reuses the client cache across repeat and concurrent mounts', async () => {
    const meta = makeMeta(XLM_ID, 7, 'XLM');
    const { getTokenMetadata, client } = makeClient(async () => meta);

    const firstMount = render(
      <>
        <TokenProbe client={client} tokenId={XLM_ID} />
        <TokenProbe client={client} tokenId={XLM_ID} />
      </>,
    );

    expect(getTokenMetadata).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      for (const probe of screen.getAllByTestId('token-probe')) {
        expect(probe.textContent).toBe('XLM');
      }
    });

    firstMount.unmount();

    // Repeat mount for the same client and token reuses the cached metadata immediately.
    const { result } = renderHook(() => useTokenMetadata(client, XLM_ID));
    expect(result.current.loading).toBe(false);
    expect(result.current.metadata).toEqual(meta);
    expect(result.current.error).toBeNull();
    expect(getTokenMetadata).toHaveBeenCalledTimes(1);

    // A separate client instance fetches independently.
    const { getTokenMetadata: otherGet, client: otherClient } = makeClient(async () => meta);
    const { result: otherResult } = renderHook(() => useTokenMetadata(otherClient, XLM_ID));
    await waitFor(() => expect(otherResult.current.loading).toBe(false));
    expect(otherGet).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, '', '   '])(
    'resolves %j token id to null without making a request',
    (blankTokenId) => {
      const { getTokenMetadata, client } = makeClient();

      const { result } = renderHook(() => useTokenMetadata(client, blankTokenId));

      expect(result.current.metadata).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(getTokenMetadata).not.toHaveBeenCalled();
    },
  );

  it('resolves to null without requesting when client is null', () => {
    const { result } = renderHook(() => useTokenMetadata(null, USDC_ID));

    expect(result.current.metadata).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces RPC failures and evicts the failed entry so a remount retries', async () => {
    const meta = makeMeta(USDC_ID, 6, 'USDC');
    const { getTokenMetadata, client } = makeClient();
    getTokenMetadata
      .mockRejectedValueOnce(new Error('RPC unreachable'))
      .mockResolvedValueOnce(meta);

    const first = renderHook(() => useTokenMetadata(client, USDC_ID));

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.metadata).toBeNull();
    expect(first.result.current.error).toBe('RPC unreachable');
    expect(getTokenMetadata).toHaveBeenCalledTimes(1);

    first.unmount();

    const second = renderHook(() => useTokenMetadata(client, USDC_ID));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.metadata).toEqual(meta);
    expect(second.result.current.error).toBeNull();
    expect(getTokenMetadata).toHaveBeenCalledTimes(2);
  });
});
