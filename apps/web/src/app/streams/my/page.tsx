'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Inbox, Loader2, RefreshCw, Wallet, Waves } from 'lucide-react';
import { useWallet } from '@stellar-starter-kit/wallets';
import { DEFAULT_EVENT_LOOKBACK_LEDGERS, StreamsClient } from '@stellar-starter-kit/sdk';
import {
  Alert,
  Button,
  Footer,
  Header,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from '@stellar-starter-kit/ui';
import { useStreams } from '@stellar-starter-kit/hooks';
import { getStreamMetrics, type Stream } from '@stellar-starter-kit/types';
import { formatAddress, formatBps, formatDuration } from '@stellar-starter-kit/utils';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import { environmentConfig, environmentErrors } from '../../../lib/environment';
import ConfigurationError from '../../../components/ConfigurationError';
import { REPO_URL } from '../../../lib/constants';

/**
 * Groups the digits of an i128 amount without converting it to `Number`, so
 * values above `Number.MAX_SAFE_INTEGER` keep every digit.
 *
 * Amounts stay in the token's smallest unit on purpose: the SEP-41 `decimals()`
 * of every distinct token would cost one simulation per token just to render
 * this list, and a wrong assumption would silently misstate the amount.
 */
function formatBaseUnits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One received stream, with the fields a recipient cares about. */
export function ReceivedStreamCard({ stream, now }: { stream: Stream; now: number }) {
  const metrics = getStreamMetrics(stream, now);
  const timeline = stream.cancelled
    ? 'Cancelled — the unvested balance went back to the sender.'
    : metrics.status === 'completed'
      ? 'Fully vested.'
      : metrics.status === 'scheduled'
        ? 'Starts vesting soon.'
        : `${formatDuration(metrics.remainingSeconds)} left to vest.`;

  return (
    <li className="rounded-2xl border border-slate-900 bg-slate-950/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-white">Stream #{stream.id}</p>
          <p className="mt-1 text-xs text-slate-500">
            From <span className="font-mono text-slate-300">{formatAddress(stream.sender, 6)}</span>
          </p>
          {stream.label ? <p className="mt-1 text-sm text-slate-300">{stream.label}</p> : null}
        </div>
        <StatusBadge status={metrics.status} />
      </div>

      <div className="mt-4 space-y-2">
        <ProgressBar value={metrics.progressBps / 100} label="Vested" />
        <div className="flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
          <span>{formatBps(metrics.progressBps)} vested</span>
          <span>{timeline}</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-900 pt-4 text-xs">
        <div>
          <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Total (base units)</dt>
          <dd className="mt-1 font-mono text-slate-300">{formatBaseUnits(stream.totalAmount)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
            Claimable now (base units)
          </dt>
          <dd className="mt-1 font-mono text-cyan-300">
            {formatBaseUnits(metrics.claimable.toString())}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Withdrawn</dt>
          <dd className="mt-1 font-mono text-slate-300">{formatBaseUnits(stream.withdrawn)}</dd>
        </div>
        <div>
          <dt className="text-[10px] tracking-wide text-slate-500 uppercase">Token</dt>
          <dd className="mt-1 font-mono text-slate-400">{formatAddress(stream.token, 6)}</dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * Route entry point: validates the environment once, then renders the inbox. A
 * failed validation is shown instead of mounting the view, so a deployment that
 * points at the wrong network or contract is visible rather than silently
 * listing nothing.
 */
export default function MyStreamsPage({ config: propConfig }: { config?: EnvironmentConfig } = {}) {
  const config = propConfig ?? environmentConfig;
  if (!config) {
    return <ConfigurationError errors={environmentErrors} />;
  }
  return <MyStreams config={config} />;
}

/**
 * Wallet-bound inbox of received streams.
 *
 * The listing is derived entirely from the stream contract's `created` events
 * (`useStreams` → the SDK's `listStreams`), so no backend or indexer is needed.
 * The SDK accepts one cursor window per call; `loadMore` scans further back in
 * the node's retained event window. The first paint never waits on RPC: the
 * page shell renders immediately and the list fills in from the effect-driven
 * hook.
 */
export function MyStreams({ config }: { config: EnvironmentConfig }) {
  const { sorobanRpcUrl, networkPassphrase, streamContractId } = config;
  const activeContractId = process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID ?? streamContractId ?? '';
  const isContractConfigured = activeContractId.length > 0;

  const { activeAddress, isConnected, isConnecting, connect, disconnect, signTransaction } =
    useWallet();
  const [connectError, setConnectError] = useState<string | null>(null);

  const client = useMemo(
    () =>
      new StreamsClient({
        contractId: activeContractId,
        rpcUrl: sorobanRpcUrl,
        networkPassphrase,
        publicKey: activeAddress ?? undefined,
        signTransaction: async (xdr: string) => signTransaction(xdr),
      }),
    [activeAddress, signTransaction, activeContractId, sorobanRpcUrl, networkPassphrase],
  );

  const { streams, loading, loadingMore, hasMore, error, refresh, loadMore } = useStreams(
    isContractConfigured ? client : null,
    activeAddress,
  );

  // `listStreams` returns streams involving the address as sender or recipient;
  // the inbox is only what was sent to this wallet.
  const receivedStreams = useMemo(
    () => (activeAddress ? streams.filter((stream) => stream.recipient === activeAddress) : []),
    [activeAddress, streams],
  );

  const now = Math.floor(Date.now() / 1000);

  const handleConnect = useCallback(() => {
    setConnectError(null);
    connect('freighter').catch((err: unknown) => {
      setConnectError(err instanceof Error ? err.message : 'Could not connect to Freighter.');
    });
  }, [connect]);

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <Header />
      <main className="relative z-10 mx-auto max-w-4xl px-6 pt-12 pb-24">
        <Link
          href="/streams"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the dashboard
        </Link>

        <div className="mt-6 mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-300">
            <Inbox className="h-3.5 w-3.5" /> Recipient inbox
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            My streams
          </h1>
          <p className="mt-3 max-w-2xl text-lg font-light text-slate-400">
            Streams sent to your connected wallet, discovered from the stream contract&apos;s{' '}
            <code className="font-mono text-cyan-300">created</code> events. No backend or indexer
            is involved: the scan reads the events a Soroban RPC node still retains (roughly the
            last {DEFAULT_EVENT_LOOKBACK_LEDGERS.toLocaleString('en-US')} ledgers), so older streams
            need an indexer to appear.
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
              onClick={disconnect}
              className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wallet className="h-3.5 w-3.5" />
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

        {!isContractConfigured ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Stream contract not configured</p>
              <p className="mt-1 font-light text-amber-200/80">
                Set <code className="font-mono">NEXT_PUBLIC_STREAM_CONTRACT_ID</code> to list the
                streams sent to this wallet. See{' '}
                <a
                  href={`${REPO_URL}/blob/main/docs/development-guide.md`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline hover:text-amber-100"
                >
                  docs/development-guide.md
                </a>
                .
              </p>
            </div>
          </div>
        ) : !isConnected ? (
          <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-8 text-center">
            <Waves className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-200">Connect your wallet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
              The inbox is bound to the connected address: only streams where it is the recipient
              are shown, and nothing is requested until a wallet is connected.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-3 rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
            <span role="status" className="sr-only">
              Scanning recent ledgers for streams sent to you
            </span>
            <Skeleton height="1.5rem" width="35%" rounded="sm" />
            <Skeleton height="1rem" width="65%" rounded="sm" />
            <Skeleton height="1rem" width="50%" rounded="sm" />
          </div>
        ) : error ? (
          <Alert tone="error" title="Could not load your streams" className="mb-6">
            <p>{error}</p>
            <p className="mt-1 text-xs text-rose-100/80">
              The Soroban RPC node may be unreachable or rate limiting the event scan. Retrying
              starts a fresh scan from the latest ledger.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refresh()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-white">Received</h2>
              <p className="text-sm text-slate-400">
                {receivedStreams.length} stream{receivedStreams.length === 1 ? '' : 's'} sent to you
              </p>
            </div>

            {receivedStreams.length === 0 ? (
              <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-8 text-center">
                <Inbox className="mx-auto h-8 w-8 text-slate-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  No streams sent to this wallet in the scanned ledgers
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                  {hasMore
                    ? 'The scan has more events to read. Load more to look further back in the node’s retained window.'
                    : 'Streams older than the node’s event window cannot be discovered without an indexer.'}
                </p>
                {hasMore ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    loading={loadingMore}
                    className="mt-4 px-5 py-2 text-xs"
                  >
                    {loadingMore ? 'Loading more streams…' : 'Load more'}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-3">
                {receivedStreams.map((stream) => (
                  <ReceivedStreamCard key={stream.id} stream={stream} now={now} />
                ))}
              </ul>
            )}

            {receivedStreams.length > 0 ? (
              <div className="flex flex-col items-center justify-center pt-2">
                {hasMore ? (
                  <Button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    loading={loadingMore}
                    variant="secondary"
                    className="px-6 py-2"
                  >
                    {loadingMore ? 'Loading more streams…' : 'Load more'}
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">
                    End of list — all events in the scanned window have been read
                  </p>
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
