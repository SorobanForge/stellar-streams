import { useCallback, useEffect, useRef, useState } from 'react';
import type { EscrowClient, EscrowMilestones } from '@stellar-starter-kit/sdk';
import type { Escrow, EscrowStatus } from '@stellar-starter-kit/types';
import { dedupeRequest } from './request-cache.js';

/** Any escrow id accepted by the `EscrowClient` read and write methods. */
export type EscrowId = bigint | number | string;

/** Extra attempts after the first failed refresh. */
const DEFAULT_RETRIES = 2;
/** Delay before the first retry; each further attempt doubles it. */
const DEFAULT_RETRY_DELAY_MS = 500;
/** Upper bound for the exponential backoff delay. */
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

/** Statuses after which an escrow can no longer change on chain. */
const FINAL_STATUSES: ReadonlySet<EscrowStatus> = new Set(['released', 'refunded', 'cancelled']);

/**
 * Whether an escrow has reached a terminal status (`released`, `refunded` or
 * `cancelled`) and can no longer change, so there is nothing left to poll for.
 */
export function isEscrowFinal(escrow: Pick<Escrow, 'status'> | null | undefined): boolean {
  return escrow != null && FINAL_STATUSES.has(escrow.status);
}

export interface UseEscrowOptions {
  /**
   * Poll interval in milliseconds. `0` (the default) disables polling. Polling
   * stops on its own once the escrow is final (see {@link isEscrowFinal}).
   */
  pollMs?: number;
  /** Extra fetch attempts after the first failure. Defaults to `2`. */
  retries?: number;
  /** Delay before the first retry. Each further attempt doubles it. Defaults to `500`. */
  retryDelayMs?: number;
  /** Upper bound for the backoff delay. Defaults to `8000`. */
  maxRetryDelayMs?: number;
}

export interface UseEscrowResult {
  /** The escrow, or `null` before the first load, without an id, or when it does not exist. */
  escrow: Escrow | null;
  /**
   * Milestone amounts in the token's smallest unit, as decimal strings. Empty
   * for an escrow without a milestone schedule.
   */
  milestones: string[];
  /** `released[i]` is `true` once milestone `i` has been paid out. Same length as `milestones`. */
  released: boolean[];
  /** `true` once the escrow is released, refunded or cancelled; polling has stopped. */
  isFinal: boolean;
  loading: boolean;
  error: string | null;
  /**
   * `true` while the displayed values come from an earlier successful load —
   * a refresh attempt failed and the hook is backing off, or the retries are
   * exhausted. Cleared by the next successful load.
   */
  isStale: boolean;
  /** Re-reads the escrow and its milestones, bypassing the shared in-flight cache. */
  refresh: () => Promise<void>;
}

const NO_MILESTONES: EscrowMilestones = { amounts: [], released: [] };

/** Resolves after `ms`, or as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * Loads an escrow and its milestone schedule from an `EscrowClient`, mirroring
 * `useStream`: it re-fetches whenever the client or id changes, retries failed
 * reads with exponential backoff, can poll, and exposes `loading`, `error`,
 * `isStale` and `refresh` with the same meaning.
 *
 * - Milestones are read alongside the escrow and exposed as `milestones`
 *   (amounts) and `released` (one flag per milestone).
 * - Polling stops by itself once the escrow is final (released, refunded or
 *   cancelled), since nothing about it can change any more. A `refresh()`
 *   still works afterwards.
 * - Every load runs under an `AbortController` that is aborted on unmount, when
 *   the client or id changes, and when a newer load starts, so a slow response
 *   for an old id can never overwrite the current one and pending retry
 *   backoffs end immediately.
 * - Concurrent hooks for the same client and id share one in-flight read;
 *   `refresh()` bypasses that cache.
 *
 * @example
 * ```tsx
 * const { escrow, milestones, released, isFinal, error, refresh } = useEscrow(
 *   escrowClient,
 *   escrowId,
 *   { pollMs: 5_000 },
 * );
 * ```
 */
export function useEscrow(
  client: EscrowClient | null,
  id: EscrowId | null,
  pollMs?: number,
): UseEscrowResult;
export function useEscrow(
  client: EscrowClient | null,
  id: EscrowId | null,
  options?: UseEscrowOptions,
): UseEscrowResult;
export function useEscrow(
  client: EscrowClient | null,
  id: EscrowId | null,
  options: number | UseEscrowOptions = {},
): UseEscrowResult {
  const settings: UseEscrowOptions = typeof options === 'number' ? { pollMs: options } : options;
  const pollMs = settings.pollMs ?? 0;
  const retries = settings.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = settings.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxRetryDelayMs = settings.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;

  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [schedule, setSchedule] = useState<EscrowMilestones>(NO_MILESTONES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  /** The controller of the newest load; older loads see their own signal aborted. */
  const current = useRef<AbortController | null>(null);
  const key = id === null ? null : String(id);

  const load = useCallback(
    async (bypassCache: boolean) => {
      current.current?.abort();
      const controller = new AbortController();
      current.current = controller;
      const { signal } = controller;

      if (!client || id === null) {
        setEscrow(null);
        setSchedule(NO_MILESTONES);
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
            const readEscrow = () => client.getEscrow(id);
            const readMilestones = () => client.getMilestones(id);
            const [nextEscrow, nextSchedule] = await Promise.all([
              bypassCache ? readEscrow() : dedupeRequest(client, `escrow:${key}`, readEscrow),
              bypassCache
                ? readMilestones()
                : dedupeRequest(client, `escrow-milestones:${key}`, readMilestones),
            ]);
            if (signal.aborted) return;
            setEscrow(nextEscrow);
            setSchedule(nextSchedule ?? NO_MILESTONES);
            setError(null);
            setIsStale(false);
            return;
          } catch (err) {
            if (signal.aborted) return;
            // Keep the last good value visible while a transient read retries.
            setIsStale(true);
            if (attempt >= retries) {
              setError(err instanceof Error ? err.message : 'Failed to load escrow');
              return;
            }
            await wait(Math.min(retryDelayMs * 2 ** attempt, maxRetryDelayMs), signal);
            if (signal.aborted) return;
          }
        }
      } finally {
        // Only the newest load owns the spinner.
        if (current.current === controller) setLoading(false);
      }
    },
    [client, id, key, retries, retryDelayMs, maxRetryDelayMs],
  );

  /** Manual refresh: always bypasses the in-flight cache. */
  const refresh = useCallback(() => load(true), [load]);

  // A different escrow must never show the previous one's data while it loads.
  useEffect(() => {
    setEscrow(null);
    setSchedule(NO_MILESTONES);
    setIsStale(false);
  }, [client, key]);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Abort whatever is in flight when the hook unmounts.
  useEffect(
    () => () => {
      current.current?.abort();
      current.current = null;
    },
    [],
  );

  const isFinal = isEscrowFinal(escrow);

  // Poll while the tab is visible, until the escrow can no longer change.
  useEffect(() => {
    if (typeof window === 'undefined' || !pollMs || !client || id === null || isFinal) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      stop();
      timer = setInterval(() => void refresh(), pollMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [pollMs, refresh, client, id, isFinal]);

  return {
    escrow,
    milestones: schedule.amounts,
    released: schedule.released,
    isFinal,
    loading,
    error,
    isStale,
    refresh,
  };
}
