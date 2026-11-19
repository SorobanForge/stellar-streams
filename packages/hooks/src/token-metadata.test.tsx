import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamsClient, TokenMetadata } from '@stellar-starter-kit/sdk';
import { useTokenMetadata } from './index';
import { clearRequestCache } from './request-cache';

const USDC_TOKEN = 'CUSDC';

const metadata: TokenMetadata = { contractId: USDC_TOKEN, decimals: 6, symbol: 'USDC' };

function makeClient(getTokenMetadata: (tokenId: string) => Promise<TokenMetadata>) {
  return { getTokenMetadata } as unknown as StreamsClient;
}

describe('useTokenMetadata', () => {
  beforeEach(() => {
    clearRequestCache();
  });

  it('loads the token metadata for a contract id', async () => {
    const getTokenMetadata = vi.fn().mockResolvedValue(metadata);
    const { result } = renderHook(() => useTokenMetadata(makeClient(getTokenMetadata), USDC_TOKEN));

    expect(result.current.metadata).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.metadata).toEqual(metadata));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getTokenMetadata).toHaveBeenCalledWith(USDC_TOKEN);
  });

  it.each([null, undefined, '', '   '])(
    'resolves a blank token id (%s) to null without a request',
    async (tokenId) => {
      const getTokenMetadata = vi.fn().mockResolvedValue(metadata);
      const { result } = renderHook(() => useTokenMetadata(makeClient(getTokenMetadata), tokenId));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.metadata).toBeNull();
      expect(result.current.error).toBeNull();
      expect(getTokenMetadata).not.toHaveBeenCalled();
    },
  );

  it('surfaces an RPC failure as an error', async () => {
    const getTokenMetadata = vi.fn().mockRejectedValue(new Error('rpc down'));
    const { result } = renderHook(() => useTokenMetadata(makeClient(getTokenMetadata), USDC_TOKEN));

    await waitFor(() => expect(result.current.error).toBe('rpc down'));

    expect(result.current.metadata).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('shares one in-flight read between hooks for the same token', async () => {
    const getTokenMetadata = vi.fn().mockResolvedValue(metadata);
    const client = makeClient(getTokenMetadata);

    const first = renderHook(() => useTokenMetadata(client, USDC_TOKEN));
    const second = renderHook(() => useTokenMetadata(client, USDC_TOKEN));

    await waitFor(() => expect(first.result.current.metadata).toEqual(metadata));
    await waitFor(() => expect(second.result.current.metadata).toEqual(metadata));

    expect(getTokenMetadata).toHaveBeenCalledTimes(1);
  });
});
