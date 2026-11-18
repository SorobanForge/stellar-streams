import { useCallback, useEffect, useRef, useState } from 'react';
import type { Split } from '@stellar-starter-kit/types';
import { useContractMutation, type MutationOptions, type MutationResult } from './mutation.js';

/**
 * Hooks for the splits contract.
 *
 * The SDK does not ship a `SplitsClient` yet, so these hooks are typed against
 * the structural `SplitsClientLike` below. A future `SplitsClient` that exposes
 * `getSplit`, `listSplits`, `createSplit` and `distribute` satisfies it without
 * any change here.
 */

/** Any split id accepted by the splits contract methods. */
export type SplitId = bigint | number | string;

/** Inputs for `create_split`. `shares[i]` is the weight of `recipients[i]`. */
export interface CreateSplitParams {
  creator: string;
  recipients: string[];
  shares: number[];
}

/** Inputs for `distribute`. `amount` is in the token's smallest unit. */
export interface DistributeSplitParams {
  from: string;
  token: string;
  amount: string;
}

/** Filters accepted by the optional listing method. */
export interface ListSplitsParams {
  /** Only return splits created by this address when the client supports it. */
  creator?: string;
  /** Cancels the in-flight listing when the hook unmounts or its args change. */
  signal?: AbortSignal;
}

/** The splits methods the hooks use. Matches the planned `SplitsClient`. */
export interface SplitsClientLike {
  getSplit(id: SplitId): Promise<Split | null>;
  listSplits?(params?: ListSplitsParams): Promise<Split[] | { splits: Split[] }>;
  createSplit(params: CreateSplitParams): Promise<{ hash: string }>;
  distribute(id: SplitId, params: DistributeSplitParams): Promise<{ hash: string }>;
}

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/**
 * Refetch listeners, grouped by client. Mutations notify after they confirm so
 * every split view re-reads without the component wiring it up itself.
 */
const refreshers = new WeakMap<object, Set<() => void | Promise<void>>>();

function subscribeToSplits(scope: object, listener: () => void | Promise<void>): () => void {
  let listeners = refreshers.get(scope);
  if (!listeners) {
    listeners = new Set();
    refreshers.set(scope, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs every registered refetch; failures are the hooks' own to report. */
function notifySplitsChanged(scope: object): void {
  const listeners = refreshers.get(scope);
  if (!listeners) return;
  for (const listener of listeners) {
    void Promise.resolve()
      .then(listener)
      .catch(() => {});
  }
}

export interface UseSplitResult {
  /** The split, or `null` while loading or if it does not exist. */
  data: Split | null;
  loading: boolean;
  error: string | null;
  /** Re-reads the split, e.g. after creating or distributing. */
  refetch: () => Promise<void>;
}

/** Loads a single split and re-reads it whenever the client or id changes. */
export function useSplit(client: SplitsClientLike | null, id: SplitId | null): UseSplitResult {
  const [data, setData] = useState<Split | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Only the latest request may commit state. */
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    if (!client || id === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const split = await client.getSplit(id);
      if (!mounted.current || request !== requestId.current) return;
      setData(split);
    } catch (err) {
      if (!mounted.current || request !== requestId.current) return;
      setData(null);
      setError(errorMessage(err, 'Failed to load split'));
    } finally {
      if (mounted.current && request === requestId.current) setLoading(false);
    }
  }, [client, id]);

  useEffect(() => {
    void refetch();
    return () => {
      requestId.current += 1;
    };
  }, [refetch]);

  useEffect(() => {
    if (!client) return;
    return subscribeToSplits(client, refetch);
  }, [client, refetch]);

  return { data, loading, error, refetch };
}

export interface UseSplitsResult {
  /** Splits returned by the client, or `[]` while loading / unsupported. */
  data: Split[];
  loading: boolean;
  error: string | null;
  /** Re-run the listing, e.g. after creating or distributing a split. */
  refetch: () => Promise<void>;
}

/**
 * Lists splits through the client's optional `listSplits`. When the method is
 * unavailable it degrades to an empty list with no error, mirroring
 * `useStreams`, so a dashboard works before the SDK listing ships.
 */
export function useSplits(
  client: SplitsClientLike | null,
  creator?: string | null,
): UseSplitsResult {
  const [data, setData] = useState<Split[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    abortRef.current?.abort();
    abortRef.current = null;

    const listSplits = client?.listSplits;
    if (!client || typeof listSplits !== 'function') {
      setData([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    const params: ListSplitsParams = { signal: controller.signal };
    if (creator) params.creator = creator;

    try {
      const found = await listSplits.call(client, params);
      if (!mounted.current || request !== requestId.current || controller.signal.aborted) return;
      setData(Array.isArray(found) ? found : found.splits);
    } catch (err) {
      if (!mounted.current || request !== requestId.current || controller.signal.aborted) return;
      setData([]);
      setError(errorMessage(err, 'Failed to load splits'));
    } finally {
      if (mounted.current && request === requestId.current) setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [client, creator]);

  useEffect(() => {
    void refetch();
    return () => {
      requestId.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [refetch]);

  useEffect(() => {
    if (!client) return;
    return subscribeToSplits(client, refetch);
  }, [client, refetch]);

  return { data, loading, error, refetch };
}

export type SplitMutationOptions = MutationOptions;
export type SplitMutationResult<TArgs extends unknown[]> = MutationResult<TArgs>;

/** Creates a split and refreshes the split views once it confirms. */
export function useCreateSplit(
  client: SplitsClientLike | null,
  options: SplitMutationOptions = {},
): SplitMutationResult<[CreateSplitParams]> {
  const run = useCallback(async (splits: SplitsClientLike, params: CreateSplitParams) => {
    const result = await splits.createSplit(params);
    notifySplitsChanged(splits);
    return result;
  }, []);
  return useContractMutation<SplitsClientLike, [CreateSplitParams]>(client, run, options);
}

/** Distributes a token amount across a split's recipients. */
export function useDistributeSplit(
  client: SplitsClientLike | null,
  options: SplitMutationOptions = {},
): SplitMutationResult<[SplitId, DistributeSplitParams]> {
  const run = useCallback(
    async (splits: SplitsClientLike, id: SplitId, params: DistributeSplitParams) => {
      const result = await splits.distribute(id, params);
      notifySplitsChanged(splits);
      return result;
    },
    [],
  );
  return useContractMutation<SplitsClientLike, [SplitId, DistributeSplitParams]>(
    client,
    run,
    options,
  );
}
