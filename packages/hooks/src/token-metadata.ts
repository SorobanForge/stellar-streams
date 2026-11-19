import { useEffect, useRef, useState } from 'react';
import type { StreamsClient, TokenMetadata } from '@stellar-starter-kit/sdk';
import { dedupeRequest } from './request-cache.js';

export interface UseTokenMetadataResult {
  /** The token's on-chain metadata, or `null` while loading, missing or failed. */
  metadata: TokenMetadata | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads a token's `decimals` and `symbol` so amounts are scaled by the token
 * itself instead of assuming XLM's seven decimals.
 *
 * A blank or missing `tokenId` resolves to `null` without an RPC call. Reads
 * are shared through the client's request cache, so several components asking
 * for the same token in the same tick simulate `decimals`/`symbol` once; the
 * SDK then serves repeat reads from its own per-token cache.
 */
export function useTokenMetadata(
  client: StreamsClient | null,
  tokenId: string | null | undefined,
): UseTokenMetadataResult {
  const token = tokenId?.trim() ?? '';
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Only the latest token may commit state. */
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const request = ++requestId.current;

    if (!client || !token) {
      setMetadata(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    dedupeRequest(client, `token-metadata:${token}`, () => client.getTokenMetadata(token))
      .then((next) => {
        if (!mounted.current || request !== requestId.current) return;
        setMetadata(next);
      })
      .catch((err: unknown) => {
        if (!mounted.current || request !== requestId.current) return;
        setMetadata(null);
        setError(err instanceof Error ? err.message : 'Failed to load token metadata');
      })
      .finally(() => {
        if (mounted.current && request === requestId.current) setLoading(false);
      });
  }, [client, token]);

  return { metadata, loading, error };
}
