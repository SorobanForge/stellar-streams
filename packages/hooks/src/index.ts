import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamsClient } from '@stellar-starter-kit/sdk';
import type { CreateStreamParams, Stream } from '@stellar-starter-kit/types';

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

/** Any stream id accepted by the `StreamsClient` read and write methods. */
export type StreamId = bigint | number | string;

/** Extra attempts after the first failed refresh. */
const DEFAULT_RETRIES = 2;
/** Delay before the first retry; each further attempt doubles it. */
const DEFAULT_RETRY_DELAY_MS = 500;
/** Upper bound for the exponential backoff delay. */
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface UseStreamOptions {
  /** Poll interval in milliseconds. `0` (the default) disables polling. */
  pollMs?: number;
  /** Extra fetch attempts after the first failure. Defaults to `2`. */
  retries?: number;
  /** Delay before the first retry. Each further attempt doubles it. Defaults to `500`. */
  retryDelayMs?: number;
  /** Upper bound for the backoff delay. Defaults to `8000`. */
  maxRetryDelayMs?: number;
}

export interface UseStreamResult {
  stream: Stream | null;
  claimable: bigint;
  loading: boolean;
  error: string | null;
  /**
   * `true` while the displayed values come from an earlier successful load —
   * a refresh attempt failed and the hook is backing off, or the retries are
   * exhausted. Cleared by the next successful load, so a UI can show a subtle
   * "reconnecting" hint instead of blanking the stream.
   */
  isStale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Loads a single stream (and its claimable balance) from a `StreamsClient`,
 * re-fetching whenever the client or id changes, and exposing a `refresh`.
 *
 * A failed refresh retries with bounded exponential backoff instead of erroring
 * immediately: the last successful value stays on screen and `isStale` flips to
 * `true` until a refresh succeeds, while `error` is only set once the retries
 * are exhausted.
 *
 * The third argument accepts either a bare `pollMs` (kept for compatibility) or
 * a `UseStreamOptions` object.
 */
export function useStream(
  client: StreamsClient | null,
  id: StreamId | null,
  pollMs?: number,
): UseStreamResult;
export function useStream(
  client: StreamsClient | null,
  id: StreamId | null,
  options?: UseStreamOptions,
): UseStreamResult;
export function useStream(
  client: StreamsClient | null,
  id: StreamId | null,
  options: number | UseStreamOptions = {},
): UseStreamResult {
  const settings: UseStreamOptions = typeof options === 'number' ? { pollMs: options } : options;
  const pollMs = settings.pollMs ?? 0;
  const retries = settings.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = settings.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxRetryDelayMs = settings.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;

  const [stream, setStream] = useState<Stream | null>(null);
  const [claimable, setClaimable] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const mounted = useRef(true);

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
      setError(null);
      setIsStale(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const [nextStream, nextClaimable] = await Promise.all([
            client.getStream(id),
            client.claimable(id).catch(() => 0n),
          ]);
          if (!mounted.current) return;
          setStream(nextStream);
          setClaimable(nextClaimable);
          setError(null);
          setIsStale(false);
          return;
        } catch (err) {
          if (!mounted.current) return;
          // Keep the last good value on screen — a transient RPC hiccup must
          // not read as "the stream disappeared".
          setIsStale(true);
          if (attempt >= retries) {
            setError(err instanceof Error ? err.message : 'Failed to load stream');
            return;
          }
          await sleep(Math.min(retryDelayMs * 2 ** attempt, maxRetryDelayMs));
          if (!mounted.current) return;
        }
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [client, id, retries, retryDelayMs, maxRetryDelayMs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollMs || !client || id === null) return;
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh, client, id]);

  return { stream, claimable, loading, error, isStale, refresh };
}

/** Lifecycle of a single mutation. */
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export interface StreamMutationOptions {
  /** Called once the transaction confirms, with its hash. */
  onSuccess?: (result: { hash: string }) => void;
  /** Called on failure, with the same message exposed as `error`. */
  onError?: (message: string) => void;
}

export interface StreamMutationResult<TArgs extends unknown[]> {
  /**
   * Submits the mutation. Resolves to the confirmed `{ hash }`, or to `null`
   * when the call was skipped (no client, or another mutation is already in
   * flight) or when it failed — failures surface through `error` and `status`.
   */
  mutate: (...args: TArgs) => Promise<{ hash: string } | null>;
  status: MutationStatus;
  error: string | null;
  /** Hash of the last confirmed transaction; cleared by `reset`. */
  hash: string | null;
  /** Returns the hook to `idle` and clears `error` and `hash`. */
  reset: () => void;
}

type MutationRunner<TArgs extends unknown[]> = (
  client: StreamsClient,
  ...args: TArgs
) => Promise<{ hash: string }>;

/**
 * Shared state machine behind every mutation hook: one call in flight per hook
 * instance, a single `status`, and the confirmed hash. A second call while a
 * mutation is pending is a documented no-op resolving to `null`.
 */
function useStreamMutation<TArgs extends unknown[]>(
  client: StreamsClient | null,
  run: MutationRunner<TArgs> | null,
  options: StreamMutationOptions,
): StreamMutationResult<TArgs> {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Read through a ref so `mutate` keeps a stable identity even when a caller
  // passes inline arrow functions.
  const callbacks = useRef(options);

  useEffect(() => {
    callbacks.current = options;
  }, [options]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const mutate = useCallback(
    async (...args: TArgs): Promise<{ hash: string } | null> => {
      if (!client || !run || inFlight.current) return null;

      inFlight.current = true;
      setStatus('pending');
      setError(null);
      setHash(null);
      try {
        const result = await run(client, ...args);
        if (mounted.current) {
          setHash(result.hash);
          setStatus('success');
        }
        callbacks.current.onSuccess?.(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        if (mounted.current) {
          setError(message);
          setStatus('error');
        }
        callbacks.current.onError?.(message);
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [client, run],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setHash(null);
  }, []);

  return { mutate, status, error, hash, reset };
}

/** Creates a stream, exposing the pending/success/error state to the caller. */
export function useCreateStream(
  client: StreamsClient | null,
  options: StreamMutationOptions = {},
): StreamMutationResult<[CreateStreamParams]> {
  const run = useCallback(
    (streams: StreamsClient, params: CreateStreamParams) => streams.createStream(params),
    [],
  );
  return useStreamMutation<[CreateStreamParams]>(client, run, options);
}

/** Withdraws the vested balance of a stream to its recipient. */
export function useWithdrawStream(
  client: StreamsClient | null,
  options: StreamMutationOptions = {},
): StreamMutationResult<[StreamId]> {
  const run = useCallback((streams: StreamsClient, id: StreamId) => streams.withdraw(id), []);
  return useStreamMutation<[StreamId]>(client, run, options);
}

/** Cancels a stream, refunding the unvested balance to its sender. */
export function useCancelStream(
  client: StreamsClient | null,
  options: StreamMutationOptions = {},
): StreamMutationResult<[StreamId]> {
  const run = useCallback((streams: StreamsClient, id: StreamId) => streams.cancel(id), []);
  return useStreamMutation<[StreamId]>(client, run, options);
}
