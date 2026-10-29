import { useCallback, useEffect, useRef, useState } from 'react';

/** Lifecycle of a single mutation. */
export type MutationStatus = 'idle' | 'pending' | 'success' | 'error';

export interface MutationOptions {
  /** Called once the transaction confirms, with its hash. */
  onSuccess?: (result: { hash: string }) => void;
  /** Called on failure, with the same message exposed as `error`. */
  onError?: (message: string) => void;
}

export interface MutationResult<TArgs extends unknown[]> {
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

export type MutationRunner<TClient extends object, TArgs extends unknown[]> = (
  client: TClient,
  ...args: TArgs
) => Promise<{ hash: string }>;

/**
 * Shared state machine behind every mutation hook: one call in flight per hook
 * instance, a single `status`, and the confirmed hash. A second call while a
 * mutation is pending is a documented no-op resolving to `null`.
 */
export function useContractMutation<TClient extends object, TArgs extends unknown[]>(
  client: TClient | null,
  run: MutationRunner<TClient, TArgs> | null,
  options: MutationOptions,
): MutationResult<TArgs> {
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
