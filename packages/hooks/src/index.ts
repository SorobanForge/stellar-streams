import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';
import { dedupeRequest } from './request-cache.js';

/** Tracks browser connectivity as a lightweight proxy for network status. */
export function useStellarNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export interface UseStreamResult {
  stream: Stream | null;
  claimable: bigint;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads a single stream (and its claimable balance) from a `StreamsClient`,
 * re-fetching whenever the client or id changes, and exposing a `refresh`.
 *
 * Concurrent reads of the same stream are deduplicated: hooks that mount in the
 * same tick with the same client and id share one `getStream` call (and one
 * `claimable` call) instead of each firing their own simulation. `refresh()`
 * bypasses that cache and always performs a fresh read.
 */
export function useStream(
  client: StreamsClient | null,
  id: bigint | number | string | null,
  pollMs = 0,
): UseStreamResult {
  const [stream, setStream] = useState<Stream | null>(null);
  const [claimable, setClaimable] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Reads the stream and its claimable balance. Automatic reads share the
   * in-flight cache; `bypassCache` is used by the manual `refresh()` so a user
   * action never receives a pending value from another component's read.
   */
  const load = useCallback(
    async (bypassCache: boolean) => {
      if (!client || id === null) {
        setStream(null);
        setClaimable(0n);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const readStream = () => client.getStream(id);
        const readClaimable = () => client.claimable(id).catch(() => 0n);
        const [nextStream, nextClaimable] = await Promise.all([
          bypassCache ? readStream() : dedupeRequest(client, `stream:${String(id)}`, readStream),
          bypassCache
            ? readClaimable()
            : dedupeRequest(client, `claimable:${String(id)}`, readClaimable),
        ]);
        if (!mounted.current) return;
        setStream(nextStream);
        setClaimable(nextClaimable);
      } catch (err) {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load stream');
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [client, id],
  );

  /** Manual refresh: always bypasses the in-flight cache. */
  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Handle polling with visibility awareness
  useEffect(() => {
    // Skip during SSR or when polling is disabled
    if (typeof window === 'undefined' || !pollMs || !client || id === null) return;

    // Set up initial polling
    const startPolling = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => void refresh(), pollMs);
      // Initial refresh already handled by the separate useEffect above
    };

    // Stop polling
    const stopPolling = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Resume polling with immediate refresh
        stopPolling();
        void refresh(); // Immediate refresh
        startPolling(); // Then start regular polling
      } else if (document.visibilityState === 'hidden') {
        // Pause polling when tab is hidden
        stopPolling();
      }
    };

    // Start polling assuming we begin visible (will be corrected on first visibilitychange if needed)
    startPolling();

    // Set up visibility change listener if document is available
    if (document) {
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Handle initial state (in case we start hidden)
      if (document.visibilityState === 'hidden') {
        stopPolling();
      }
    }

    // Cleanup
    return () => {
      stopPolling();
      if (document) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [pollMs, refresh, client, id]);

  return { stream, claimable, loading, error, refresh };
}

export interface UseStreamsResult {
  /** Streams involving the address, or an empty array while loading / unsupported. */
  streams: Stream[];
  loading: boolean;
  error: string | null;
  /** Re-run the listing, e.g. after creating or cancelling a stream. */
  refresh: () => Promise<void>;
}

/**
 * Parameters the SDK's `listStreams` accepts. `signal` is optional so older SDK
 * builds that do not support cancellation can still be called.
 */
export interface ListStreamsParams {
  /** Account whose sender/recipient streams should be returned. */
  address: string;
  /** First ledger to scan; the SDK documents its own default. */
  startLedger?: number;
  /** Number of events to request per RPC page. */
  pageSize?: number;
  /** Cancels the in-flight RPC scan when the hook unmounts or the address changes. */
  signal?: AbortSignal;
}

/** Structural view of the listing method the SDK exposes. */
type StreamsLister = {
  listStreams?: (
    params: ListStreamsParams,
  ) => Promise<Stream[] | { streams: Stream[]; cursor?: string }>;
};

/**
 * Loads the streams that involve `address` (sender or recipient) through the
 * SDK's `listStreams`, re-fetching whenever the client or address changes.
 *
 * The SDK result is either the current `{ streams, cursor }` page or the legacy
 * bare array; both are accepted. If the method is unavailable, `useStreams`
 * degrades gracefully: it returns an empty `streams` array,
 * `loading: false`, and no error instead of throwing.
 *
 * An empty result (a valid address with no streams) also resolves to an empty
 * array with no error. In-flight work is aborted on unmount and whenever the
 * address or client changes, so a stale response can never overwrite newer
 * state.
 */
export function useStreams(
  client: StreamsClient | null,
  address: string | null | undefined,
): UseStreamsResult {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Monotonic token: only the latest request may commit state. */
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    abortRef.current?.abort();
    abortRef.current = null;

    if (!client || !address) {
      setStreams([]);
      setError(null);
      setLoading(false);
      return;
    }

    const listStreams = (client as StreamsClient & StreamsLister).listStreams;
    if (typeof listStreams !== 'function') {
      // The SDK listing API (issue #94) has not shipped yet. An empty list is a
      // safer degradation than an error banner on a dashboard that works.
      setStreams([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const found = await listStreams.call(client, { address, signal: controller.signal });
      if (!mounted.current || request !== requestId.current || controller.signal.aborted) return;
      setStreams(Array.isArray(found) ? found : found.streams);
    } catch (err) {
      // An aborted request is not an error: the component unmounted or the
      // address changed while it was in flight.
      if (!mounted.current || request !== requestId.current || controller.signal.aborted) return;
      setStreams([]);
      setError(err instanceof Error ? err.message : 'Failed to load streams');
    } finally {
      if (mounted.current && request === requestId.current) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [client, address]);

  useEffect(() => {
    void refresh();
    return () => {
      // Invalidate and abort the request when the address/client changes or the
      // component unmounts.
      requestId.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [refresh]);

  return { streams, loading, error, refresh };
}
