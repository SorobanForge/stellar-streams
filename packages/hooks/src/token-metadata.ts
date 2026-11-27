import { useEffect, useState } from 'react';
import type { StreamsClient, TokenMetadata } from '@stellar-starter-kit/sdk';

export interface UseTokenMetadataResult {
  metadata: TokenMetadata | null;
  loading: boolean;
  error: string | null;
}

interface TokenMetadataEntry {
  promise?: Promise<TokenMetadata>;
  value?: TokenMetadata;
}

// Client-scoped cache so repeat mounts for the same token reuse the first
// read instead of re-simulating, while keeping separate clients isolated.
let metadataCache = new WeakMap<object, Map<string, TokenMetadataEntry>>();

function cacheFor(client: object): Map<string, TokenMetadataEntry> {
  let map = metadataCache.get(client);
  if (!map) {
    map = new Map<string, TokenMetadataEntry>();
    metadataCache.set(client, map);
  }
  return map;
}

/** Drops every cached token metadata entry. Intended for tests. */
export function clearTokenMetadataCache(): void {
  metadataCache = new WeakMap<object, Map<string, TokenMetadataEntry>>();
}

/**
 * Reads on-chain SEP-41 `decimals` and `symbol` for a token contract via
 * `client.getTokenMetadata(tokenId)`.
 *
 * A blank or undefined `tokenId` resolves to `null` without issuing an RPC
 * call. Repeat mounts for the same `(client, tokenId)` reuse the client cache
 * instead of re-simulating; failed reads are evicted so future mounts retry.
 */
export function useTokenMetadata(
  client: StreamsClient | null,
  tokenId: string | null | undefined,
): UseTokenMetadataResult {
  const normalizedId = typeof tokenId === 'string' ? tokenId.trim() : '';
  const cachedValue =
    client && normalizedId ? (cacheFor(client).get(normalizedId)?.value ?? null) : null;

  const [metadata, setMetadata] = useState<TokenMetadata | null>(cachedValue);
  const [loading, setLoading] = useState<boolean>(Boolean(client && normalizedId && !cachedValue));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !normalizedId) {
      setMetadata(null);
      setLoading(false);
      setError(null);
      return;
    }

    const clientCache = cacheFor(client);
    const existing = clientCache.get(normalizedId);
    if (existing?.value) {
      setMetadata(existing.value);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setMetadata(null);
    setLoading(true);
    setError(null);

    let pending = existing?.promise;
    if (!pending) {
      const fetchMeta = () => client.getTokenMetadata(normalizedId);
      pending = new Promise<TokenMetadata>((resolve) => resolve(fetchMeta()));
      const entry: TokenMetadataEntry = { promise: pending };
      clientCache.set(normalizedId, entry);
      pending.then(
        (value) => {
          if (clientCache.get(normalizedId) === entry) {
            entry.value = value;
            delete entry.promise;
          }
        },
        () => {
          if (clientCache.get(normalizedId) === entry) {
            clientCache.delete(normalizedId);
          }
        },
      );
    }

    pending.then(
      (result) => {
        if (!active) return;
        setMetadata(result);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (!active) return;
        setMetadata(null);
        setError(err instanceof Error ? err.message : 'Failed to load token metadata');
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [client, normalizedId]);

  return { metadata, loading, error };
}
