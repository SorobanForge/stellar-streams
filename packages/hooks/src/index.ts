import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { Stream } from '@stellar-starter-kit/types';

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

  const refresh = useCallback(async () => {
    if (!client || id === null) {
      setStream(null);
      setClaimable(0n);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextStream, nextClaimable] = await Promise.all([
        client.getStream(id),
        client.claimable(id).catch(() => 0n),
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
  }, [client, id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
