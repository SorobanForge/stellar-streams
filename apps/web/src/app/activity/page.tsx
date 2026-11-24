'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  History,
  Loader2,
  ReceiptText,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useWallet } from '@stellar-starter-kit/wallets';
import { Alert, Button, Footer, Header, Skeleton } from '@stellar-starter-kit/ui';
import { formatAddress } from '@stellar-starter-kit/utils';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import { environmentConfig, environmentErrors } from '../../lib/environment';
import ConfigurationError from '../../components/ConfigurationError';
import {
  explorerTransactionUrl,
  fetchActivityPage,
  formatActivityTime,
  type ActivityEntry,
  type FetchActivityPageOptions,
} from '../../lib/horizon-activity';

type FetchPage = (options: FetchActivityPageOptions) => ReturnType<typeof fetchActivityPage>;

export interface ActivityHistoryProps {
  config: EnvironmentConfig;
  /** Injectable Horizon page loader; tests replace it with an in-memory fake. */
  fetchPage?: FetchPage;
}

/**
 * Wallet-bound activity history.
 *
 * Horizon is queried directly for the connected account's newest operations;
 * no indexer or backend is involved. The first page loads as soon as a wallet is
 * connected, `Load more` follows Horizon's paging token, and a failed request
 * renders inline with a retry instead of blanking the page.
 */
export function ActivityHistory({ config, fetchPage = fetchActivityPage }: ActivityHistoryProps) {
  const { activeAddress, isConnected, isConnecting, connect, disconnect } = useWallet();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadFirstPage = useCallback(async () => {
    if (!activeAddress) {
      setEntries([]);
      setCursor(null);
      setError(null);
      setLoading(false);
      return;
    }

    const request = ++requestId.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setEntries([]);
    setCursor(null);

    try {
      const page = await fetchPage({
        horizonUrl: config.horizonUrl,
        address: activeAddress,
        signal: controller.signal,
      });
      if (request !== requestId.current || controller.signal.aborted) return;
      setEntries(page.entries);
      setCursor(page.nextCursor);
    } catch (err) {
      if (request !== requestId.current || controller.signal.aborted) return;
      setEntries([]);
      setCursor(null);
      setError(
        err instanceof Error ? err.message : 'Could not load activity from Horizon. Please retry.',
      );
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [activeAddress, config.horizonUrl, fetchPage]);

  useEffect(() => {
    void loadFirstPage();
    return () => {
      requestId.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!activeAddress || !cursor || loading || loadingMore) return;

    const request = requestId.current;
    setLoadingMore(true);
    setError(null);

    try {
      const page = await fetchPage({
        horizonUrl: config.horizonUrl,
        address: activeAddress,
        cursor,
        signal: abortRef.current?.signal,
      });
      if (request !== requestId.current) return;
      setEntries((previous) => {
        const seen = new Set(previous.map((entry) => entry.id));
        return [...previous, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      if (request !== requestId.current) return;
      setError(
        err instanceof Error ? err.message : 'Could not load more activity from Horizon. Retry.',
      );
    } finally {
      if (request === requestId.current) setLoadingMore(false);
    }
  }, [activeAddress, config.horizonUrl, cursor, fetchPage, loading, loadingMore]);

  const handleConnect = useCallback(() => {
    setConnectError(null);
    connect('freighter').catch((err: unknown) => {
      setConnectError(err instanceof Error ? err.message : 'Could not connect to Freighter.');
    });
  }, [connect]);

  const retry = entries.length > 0 ? loadMore : loadFirstPage;

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <Header />
      <main className="relative z-10 mx-auto max-w-4xl px-6 pt-12 pb-24">
        <Link
          href="/streams"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the dashboard
        </Link>

        <div className="mt-6 mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-300">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> On-chain activity
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Activity history
          </h1>
          <p className="mt-3 max-w-2xl text-lg font-light text-slate-400">
            Recent payments and contract invocations for your connected wallet, read directly from
            Horizon. Each row links to its transaction on the configured explorer.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-900 bg-slate-950/40 px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <span className="font-mono text-slate-300">
                  {formatAddress(activeAddress ?? '', 6)}
                </span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span className="text-slate-400">Wallet not connected</span>
              </>
            )}
          </div>
          {isConnected ? (
            <button
              type="button"
              onClick={disconnect}
              className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Connect Freighter
            </button>
          )}
        </div>

        {connectError ? (
          <Alert tone="error" title="Wallet connection failed" className="mb-6">
            {connectError}
          </Alert>
        ) : null}

        {!isConnected || !activeAddress ? (
          <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-8 text-center">
            <ReceiptText className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-200">Connect your wallet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              History is bound to the connected address. Nothing is requested from Horizon until a
              wallet is connected.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-3 rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
            <span role="status" className="sr-only">
              Loading recent activity from Horizon
            </span>
            <Skeleton height="1.5rem" width="35%" rounded="sm" />
            <Skeleton height="1rem" width="65%" rounded="sm" />
            <Skeleton height="1rem" width="50%" rounded="sm" />
          </div>
        ) : error && entries.length === 0 ? (
          <Alert tone="error" title="Could not load activity" className="mb-6">
            <p>{error}</p>
            <p className="mt-1 text-xs text-rose-100/80">
              Horizon may be unreachable or rate limiting the request. Retrying starts again from
              the newest operation.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadFirstPage()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </Alert>
        ) : (
          <div className="space-y-4">
            {error ? (
              <Alert tone="error" title="Could not load more activity">
                <p>{error}</p>
                <p className="mt-1 text-xs text-rose-100/80">
                  The rows already loaded are still shown.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void retry()}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                </Button>
              </Alert>
            ) : null}

            {entries.length === 0 ? (
              <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-8 text-center">
                <History className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  No payments or contract calls in this account&apos;s Horizon history
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                  Activity appears after the account sends or receives funds, or invokes a contract.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-2xl border border-slate-900 bg-slate-950/40 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-white">
                          <ReceiptText
                            className={`h-4 w-4 shrink-0 ${entry.kind === 'contract' ? 'text-purple-400' : 'text-cyan-400'}`}
                            aria-hidden="true"
                          />
                          {entry.title}
                        </p>
                        <p className="mt-1 font-mono text-xs break-all text-slate-400">
                          {entry.detail}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-500">
                          {formatActivityTime(entry.createdAt)}
                        </p>
                      </div>
                      {entry.amount ? (
                        <p className="font-mono text-sm text-cyan-300">{entry.amount}</p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-3">
                      <span className="font-mono text-[10px] break-all text-slate-500">
                        {entry.transactionHash}
                      </span>
                      <a
                        href={explorerTransactionUrl(config.expertUrl, entry.transactionHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300 transition hover:text-purple-200"
                      >
                        View on explorer
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {entries.length > 0 ? (
              <div className="flex flex-col items-center justify-center pt-2">
                {cursor ? (
                  <Button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    loading={loadingMore}
                    variant="secondary"
                    className="px-6 py-2"
                  >
                    {loadingMore ? 'Loading more activity…' : 'Load more'}
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">End of activity</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

/**
 * Route entry point: validates the environment once, then renders the history.
 * A failed validation is shown instead of mounting the view, so a deployment
 * pointed at the wrong network cannot quietly query the wrong Horizon.
 */
export default function ActivityPage({ config: propConfig }: { config?: EnvironmentConfig } = {}) {
  const config = propConfig ?? environmentConfig;
  if (!config) {
    return <ConfigurationError errors={environmentErrors} />;
  }
  return <ActivityHistory config={config} />;
}
