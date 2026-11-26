'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  ExternalLink,
  Droplets,
  Ban,
  Search,
  Wallet,
  Download,
  Inbox,
  Pause,
  Play,
  ChevronDown,
} from 'lucide-react';
import { useWallet, WALLET_PROVIDER_OPTIONS, type WalletType } from '@stellar-starter-kit/wallets';
import { StreamsClient, type TokenMetadata } from '@stellar-starter-kit/sdk';
import {
  Button,
  DataTable,
  Footer,
  Header,
  Input,
  ProgressBar,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@stellar-starter-kit/ui';
import {
  useCancelStream,
  useCreateStream,
  usePauseStream,
  useResumeStream,
  useStreams,
  useWithdrawStream,
} from '@stellar-starter-kit/hooks';
import { getStreamMetrics, type Stream } from '@stellar-starter-kit/types';
import {
  formatAddress,
  parseTokenAmount,
  computeClaimable,
  computeProtocolFee,
  formatBps,
  formatDuration,
  formatRelativeTime,
  formatTokenAmount,
} from '@stellar-starter-kit/utils';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import { environmentConfig, environmentErrors } from '../../lib/environment';
import ConfigurationError from '../../components/ConfigurationError';
import { REPO_URL } from '../../lib/constants';
import {
  getStreamDurationSeconds,
  getStreamCliffSeconds,
  validateStreamInput,
} from '../../lib/stream-validation';
import { downloadCsv, exportStreamsToCsv, getStreamsCsvFilename } from '../../lib/stream-csv';
import { formatStreamAmount } from '../../lib/stream-amount';

// framer-motion stays out of the initial route bundle; the banner only loads
// when an error/success message is shown.
const NotificationBanner = dynamic(() => import('../../components/NotificationBanner'), {
  ssr: false,
});

/** One-line vesting timeline for the inspected stream, expressed in relative time. */
function streamTimeline(stream: Stream, nowSeconds: number): string {
  if (stream.cancelled) {
    return 'Cancelled - the unvested balance was refunded to the sender.';
  }
  if (stream.pausedAt != null) {
    return 'Paused - token accrual is temporarily suspended.';
  }
  if (nowSeconds < stream.cliffTime) {
    return `Cliff ends ${formatRelativeTime(stream.cliffTime, nowSeconds)}`;
  }
  if (nowSeconds >= stream.endTime) {
    return `Fully vested ${formatRelativeTime(stream.endTime, nowSeconds)}`;
  }
  return `Ends ${formatRelativeTime(stream.endTime, nowSeconds)}`;
}

export interface StreamsDashboardProps {
  contractId?: string;
  initialStreams?: Stream[];
  config?: EnvironmentConfig;
}

/**
 * Route entry point: validates the environment once, then renders the
 * dashboard. A failed validation is shown instead of mounting the page, so no
 * client is ever built from the Testnet defaults by accident.
 */
export default function StreamsDashboardPage({
  contractId,
  initialStreams,
  config: propConfig,
}: StreamsDashboardProps = {}) {
  const config = propConfig ?? environmentConfig;
  if (!config) {
    return <ConfigurationError errors={environmentErrors} />;
  }
  return (
    <StreamsDashboard config={config} contractId={contractId} initialStreams={initialStreams} />
  );
}

export function StreamsDashboard({
  config,
  contractId: overrideContractId,
  initialStreams,
}: {
  config: EnvironmentConfig;
  contractId?: string;
  initialStreams?: Stream[];
}) {
  const {
    sorobanRpcUrl,
    networkPassphrase,
    streamContractId,
    tokenContractId,
    expertUrl,
    network,
  } = config;
  const activeContractId =
    overrideContractId !== undefined
      ? overrideContractId
      : (process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID ?? streamContractId ?? '');
  const isContractConfigured = activeContractId.length > 0;

  const { activeAddress, isConnected, isConnecting, connect, disconnect, signTransaction } =
    useWallet();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Create form.
  const [recipient, setRecipient] = useState('');
  const [token, setToken] = useState(tokenContractId);
  const [amount, setAmount] = useState('100');
  const [durationDays, setDurationDays] = useState('30');
  const [cliffDays, setCliffDays] = useState('0');

  // Lookup.
  const [lookupId, setLookupId] = useState('');
  const [stream, setStream] = useState<Stream | null>(null);
  const [contractClaimable, setContractClaimable] = useState<bigint>(0n);
  const [streamToken, setStreamToken] = useState<TokenMetadata | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [feeBps, setFeeBps] = useState<number | null>(null);

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

  const {
    streams: listedStreams,
    loading: listingLoading,
    loadingMore,
    hasMore,
    loadMore,
  } = useStreams(client, activeAddress);

  const loadedStreams = initialStreams ?? listedStreams;

  const handleExportCsv = useCallback(() => {
    if (!loadedStreams.length || !activeAddress) return;
    const csv = exportStreamsToCsv(loadedStreams);
    const filename = getStreamsCsvFilename(network, activeAddress);
    downloadCsv(filename, csv);
  }, [loadedStreams, activeAddress, network]);

  const notify = useCallback((kind: 'success' | 'error', message: string) => {
    if (kind === 'success') {
      setSuccess(message);
      setError(null);
    } else {
      setError(message);
      setSuccess(null);
    }
  }, []);

  const handleConnect = useCallback(
    (provider: WalletType) => {
      setPickerOpen(false);
      connect(provider).catch((err: unknown) => {
        notify('error', err instanceof Error ? err.message : 'Could not connect to the wallet.');
      });
    },
    [connect, notify],
  );

  const formErrors = useMemo(
    () =>
      validateStreamInput({
        recipient,
        token,
        amount,
        durationDays,
        cliffDays,
      }),
    [amount, cliffDays, durationDays, recipient, token],
  );
  const isFormValid = Object.keys(formErrors).length === 0;

  const loadStream = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoadingStream(true);
      try {
        const found = await client.getStream(id);
        setStream(found);
        setContractClaimable(found ? await client.claimable(id).catch(() => 0n) : 0n);
        // Amounts are in the token's smallest unit; read its decimals to display them.
        setStreamToken(found ? await client.getTokenMetadata(found.token).catch(() => null) : null);
        // Fetch protocol config for feeBps
        const config = await client.getConfig().catch(() => null);
        setFeeBps(config ? config.feeBps : 0);
        if (!found) notify('error', `No stream found with id ${id}.`);
      } catch (err: unknown) {
        notify('error', err instanceof Error ? err.message : 'Failed to load stream.');
      } finally {
        setLoadingStream(false);
      }
    },
    [client, notify],
  );

  // The mutation hooks own the pending/error/hash state that used to be
  // hand-rolled here, and refresh the inspected stream once a write confirms.
  const createStream = useCreateStream(client, {
    onSuccess: ({ hash }) => {
      notify('success', `Stream created. Tx ${formatAddress(hash, 6)}`);
      setRecipient('');
    },
    onError: (message) => notify('error', message),
  });

  const withdrawStream = useWithdrawStream(client, {
    onSuccess: ({ hash }) => {
      notify('success', `Withdraw submitted successfully. Tx ${formatAddress(hash, 6)}`);
      if (stream) void loadStream(stream.id);
    },
    onError: (message) => notify('error', message),
  });

  const cancelStream = useCancelStream(client, {
    onSuccess: ({ hash }) => {
      notify('success', `Cancel submitted successfully. Tx ${formatAddress(hash, 6)}`);
      if (stream) void loadStream(stream.id);
    },
    onError: (message) => notify('error', message),
  });

  const pauseStream = usePauseStream(client, {
    onSuccess: ({ hash }) => {
      notify('success', `Pause submitted successfully. Tx ${formatAddress(hash, 6)}`);
      if (stream) void loadStream(stream.id);
    },
    onError: (message) => notify('error', message),
  });

  const resumeStream = useResumeStream(client, {
    onSuccess: ({ hash }) => {
      notify('success', `Resume submitted successfully. Tx ${formatAddress(hash, 6)}`);
      if (stream) void loadStream(stream.id);
    },
    onError: (message) => notify('error', message),
  });

  // One mutation per hook instance is allowed at a time; `busy` mirrors that for
  // the buttons that must not start a second write.
  const busy =
    createStream.status === 'pending' ||
    withdrawStream.status === 'pending' ||
    cancelStream.status === 'pending' ||
    pauseStream.status === 'pending' ||
    resumeStream.status === 'pending';

  const runWithdraw = () => {
    if (!stream) return;
    void withdrawStream.mutate(stream.id);
  };

  const runCancel = () => {
    if (!stream) return;
    void cancelStream.mutate(stream.id);
  };

  const runPause = () => {
    if (!stream) return;
    void pauseStream.mutate(stream.id);
  };

  const runResume = () => {
    if (!stream) return;
    void resumeStream.mutate(stream.id);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isConnected || !activeAddress) {
      notify('error', 'Connect a wallet to create a stream.');
      return;
    }
    if (!isContractConfigured) {
      notify('error', 'No stream contract configured. Set NEXT_PUBLIC_STREAM_CONTRACT_ID.');
      return;
    }

    if (!isFormValid) {
      notify('error', 'Fix the highlighted stream details before submitting.');
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now;
      const endTime = now + getStreamDurationSeconds(durationDays);
      const cliffTime = now + getStreamCliffSeconds(cliffDays);

      const { decimals } = await client.getTokenMetadata(token.trim());
      await createStream.mutate({
        sender: activeAddress,
        recipient,
        token: token.trim(),
        amount: parseTokenAmount(amount, decimals).toString(),
        startTime,
        endTime,
        cliffTime,
      });
    } catch (err) {
      // Reading the token metadata can fail before the mutation is submitted;
      // the hook reports submission failures through its own `onError`.
      notify('error', err instanceof Error ? err.message : 'Failed to create stream.');
    }
  };

  // Amounts use the token's own decimals and symbol, read alongside the stream.
  // A failed SEP-41 metadata read shows the raw base-unit value instead of
  // assuming 7 decimals, and never blanks the view.
  const formatAmount = (raw: bigint | string) => {
    const formatted = formatStreamAmount(raw, streamToken);
    if (formatted.isFallback) return `${formatted.value} (base units)`;
    return `${formatted.value} ${formatted.symbol}`;
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const streamMetrics = stream ? getStreamMetrics(stream, nowSeconds) : null;
  const isPaused = Boolean(stream && stream.pausedAt != null);
  const isSender = Boolean(activeAddress && stream && activeAddress === stream.sender);
  const status = isPaused ? 'paused' : (streamMetrics?.status ?? null);
  const progress = streamMetrics?.progressBps ?? 0;
  const currentPauseDuration = stream?.pausedAt ? Math.max(0, nowSeconds - stream.pausedAt) : 0;
  const accumulatedPauseSeconds = (stream?.totalPaused ?? 0) + currentPauseDuration;
  // Net/fee math mirrors the contract's `withdraw` exactly; keep these in
  // sync with contracts/stream/src/lib.rs (see computeClaimable/computeProtocolFee
  // in packages/utils).
  const claimable = stream ? computeClaimable(stream, nowSeconds) : contractClaimable;
  const feeAmount = computeProtocolFee(claimable, feeBps ?? 0);
  const netAmount = claimable - feeAmount;

  const streamStatus = (item: Stream) =>
    item.cancelled ? 'cancelled' : getStreamMetrics(item, nowSeconds).status;

  // Column order and formatting preserve the bespoke table this replaced.
  // Amounts stay in XLM (7 decimals) as before; the base-unit listing lives in
  // the recipient inbox.
  const streamColumns: DataTableColumn<Stream>[] = [
    {
      id: 'id',
      header: 'ID',
      sortable: true,
      sortValue: (item) => item.id,
      cell: (item) => <span className="font-semibold text-white">#{item.id}</span>,
    },
    {
      id: 'recipient',
      header: 'Recipient',
      cell: (item) => formatAddress(item.recipient, 6),
    },
    {
      id: 'total',
      header: 'Total Amount',
      sortable: true,
      sortValue: (item) => item.totalAmount,
      cell: (item) => `${formatTokenAmount(item.totalAmount, 7)} XLM`,
    },
    {
      id: 'withdrawn',
      header: 'Withdrawn',
      sortable: true,
      sortValue: (item) => item.withdrawn,
      cell: (item) => `${formatTokenAmount(item.withdrawn, 7)} XLM`,
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      sortValue: streamStatus,
      cell: (item) => <StatusBadge status={streamStatus(item)} />,
    },
    {
      id: 'action',
      header: 'Action',
      cell: (item) => (
        <button
          type="button"
          onClick={() => {
            setLookupId(item.id);
            void loadStream(item.id);
          }}
          className="text-purple-400 underline hover:text-purple-300"
        >
          Inspect
        </button>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      <Header />
      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-12 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>

        <div className="mt-6 mb-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-cyan-300">
            <Droplets className="h-3.5 w-3.5" /> Stellar Streams
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Continuous payment streams
          </h1>
          <p className="mt-3 max-w-2xl text-lg font-light text-slate-400">
            Lock tokens on Soroban and let them vest by the second to a recipient. Withdraw anytime,
            cancel to refund the unvested balance, or use a cliff for milestones.
          </p>
        </div>

        {!isContractConfigured && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Stream contract not configured</p>
              <p className="mt-1 font-light text-amber-200/80">
                Deploy the <code className="font-mono">stream</code> contract and set{' '}
                <code className="font-mono">NEXT_PUBLIC_STREAM_CONTRACT_ID</code> to enable the
                dashboard. See{' '}
                <a
                  href={`${REPO_URL}/blob/main/docs/development-guide.md`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline hover:text-amber-100"
                >
                  docs/development-guide.md
                </a>{' '}
                for deployment instructions.
              </p>
            </div>
          </div>
        )}

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-900 bg-slate-950/40 px-6 py-4">
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
            <div className="relative">
              <button
                onClick={() => setPickerOpen((open) => !open)}
                disabled={isConnecting}
                aria-haspopup="menu"
                aria-expanded={pickerOpen}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wallet className="h-3.5 w-3.5" />
                )}
                Connect wallet
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {pickerOpen && (
                <>
                  {/* Invisible backdrop: a click anywhere else closes the picker. */}
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setPickerOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />
                  <div
                    role="menu"
                    aria-label="Choose a wallet"
                    className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-800 bg-[#0b0b16] py-1 shadow-2xl shadow-black/50"
                  >
                    {WALLET_PROVIDER_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleConnect(option.id)}
                        className="flex w-full items-center px-4 py-2.5 text-left text-xs font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <NotificationBanner
          kind={error ? 'error' : success ? 'success' : null}
          message={error ?? success ?? ''}
          className="mb-6"
          enterFrom="top"
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Create */}
          <form
            onSubmit={handleCreate}
            className="space-y-6 rounded-2xl border border-slate-900 bg-slate-950/40 p-6 lg:col-span-5"
          >
            <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
              New stream
            </h2>

            <fieldset disabled={!isContractConfigured} className="space-y-6">
              <Input
                label="Recipient"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="G..."
                aria-invalid={Boolean(formErrors.recipient)}
                error={formErrors.recipient}
                disabled={!isContractConfigured}
              />

              <Input
                label="Token contract"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="C..."
                aria-invalid={Boolean(formErrors.token)}
                error={formErrors.token}
                disabled={!isContractConfigured}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Amount"
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={Boolean(formErrors.amount)}
                  error={formErrors.amount}
                  disabled={!isContractConfigured}
                />
                <Input
                  label="Duration (days)"
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  aria-invalid={Boolean(formErrors.durationDays)}
                  error={formErrors.durationDays}
                  disabled={!isContractConfigured}
                />
              </div>

              <Input
                label="Cliff (days, 0 = none)"
                type="number"
                min="0"
                value={cliffDays}
                onChange={(e) => setCliffDays(e.target.value)}
                aria-invalid={Boolean(formErrors.cliffDays)}
                error={formErrors.cliffDays}
                disabled={!isContractConfigured}
              />

              <div className="space-y-2">
                <Button
                  type="submit"
                  disabled={busy || !isConnected || !isContractConfigured || !isFormValid}
                  loading={busy}
                  className="w-full"
                >
                  {!isContractConfigured
                    ? 'Stream contract not configured'
                    : busy
                      ? 'Creating stream'
                      : 'Create stream'}
                </Button>
                {!isContractConfigured && (
                  <p className="text-center text-xs text-amber-300/80">
                    Set <code className="font-mono">NEXT_PUBLIC_STREAM_CONTRACT_ID</code> to enable
                    stream creation.
                  </p>
                )}
              </div>
            </fieldset>
          </form>

          {/* Inspect */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
              <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-400 uppercase">
                Inspect a stream
              </h2>
              <div className="flex gap-3">
                <input
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  placeholder="Stream id"
                  className="w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                />
                <button
                  onClick={() => loadStream(lookupId)}
                  disabled={loadingStream || !lookupId}
                  className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:pointer-events-none disabled:opacity-40"
                >
                  {loadingStream ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Load
                </button>
              </div>

              {loadingStream && (
                <div className="mt-6 space-y-4 rounded-xl border border-slate-900 bg-slate-950/60 p-5">
                  <span role="status" className="sr-only">
                    Loading stream
                  </span>
                  <div className="flex items-center justify-between">
                    <Skeleton width={120} height="1rem" rounded="sm" />
                    <Skeleton width={72} height="1.25rem" rounded="full" />
                  </div>
                  <Skeleton height="0.5rem" rounded="full" />
                  <div className="space-y-2">
                    <Skeleton height="0.75rem" width="60%" rounded="sm" />
                    <Skeleton height="0.75rem" width="45%" rounded="sm" />
                  </div>
                </div>
              )}

              {!loadingStream && stream && (
                <div className="mt-6 space-y-4 rounded-xl border border-slate-900 bg-slate-950/60 p-5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Stream #{stream.id}</span>
                    <StatusBadge status={status ?? 'unknown'} />
                  </div>

                  <ProgressBar value={progress / 100} label="Vested" />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{formatBps(progress)} vested</span>
                    <span>{formatDuration(streamMetrics?.remainingSeconds ?? 0)} remaining</span>
                  </div>
                  <p className="text-[10px] text-slate-500">{streamTimeline(stream, nowSeconds)}</p>

                  <dl className="grid grid-cols-2 gap-4 border-t border-slate-900 pt-4">
                    <div>
                      <dt className="text-[10px] text-slate-500 uppercase">Recipient</dt>
                      <dd className="mt-1 text-slate-300">{formatAddress(stream.recipient, 6)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-500 uppercase">Total</dt>
                      <dd className="mt-1 text-slate-300">{formatAmount(stream.totalAmount)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-500 uppercase">Withdrawn</dt>
                      <dd className="mt-1 text-slate-300">{formatAmount(stream.withdrawn)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-500 uppercase">Paused time</dt>
                      <dd className="mt-1 text-slate-300">
                        {formatDuration(accumulatedPauseSeconds)}
                      </dd>
                    </div>
                    {feeBps !== null && feeBps > 0 ? (
                      <>
                        <div>
                          <dt className="text-[10px] text-slate-500 uppercase">
                            Claimable (gross)
                          </dt>
                          <dd className="mt-1 font-bold text-cyan-300">
                            {formatAmount(claimable)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-500 uppercase">
                            Protocol fee ({feeBps}%)
                          </dt>
                          <dd className="mt-1 font-bold text-cyan-300">
                            {formatAmount(feeAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] text-slate-500 uppercase">Net amount</dt>
                          <dd className="mt-1 font-bold text-cyan-300">
                            {formatAmount(netAmount)}
                          </dd>
                        </div>
                      </>
                    ) : (
                      <div>
                        <dt className="text-[10px] text-slate-500 uppercase">Claimable</dt>
                        <dd className="mt-1 font-bold text-cyan-300">{formatAmount(netAmount)}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="flex flex-wrap gap-3 border-t border-slate-900 pt-4">
                    {isSender && !isPaused && !stream.cancelled && (
                      <button
                        onClick={runPause}
                        disabled={busy || !isConnected}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {pauseStream.status === 'pending' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                        ) : (
                          <Pause className="h-3.5 w-3.5 text-amber-400" />
                        )}
                        Pause
                      </button>
                    )}
                    {isSender && isPaused && !stream.cancelled && (
                      <button
                        onClick={runResume}
                        disabled={busy || !isConnected}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {resumeStream.status === 'pending' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                        Resume
                      </button>
                    )}
                    <button
                      onClick={runWithdraw}
                      disabled={
                        busy ||
                        !isConnected ||
                        contractClaimable <= 0n ||
                        stream.cancelled ||
                        isPaused
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Droplets className="h-3.5 w-3.5 text-cyan-400" /> Withdraw
                    </button>
                    <button
                      onClick={runCancel}
                      disabled={busy || !isConnected || stream.cancelled}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Ban className="h-3.5 w-3.5 text-rose-400" /> Cancel
                    </button>
                    <a
                      href={`${expertUrl}/contract/${activeContractId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2 py-2 text-[10px] text-slate-500 transition hover:text-white"
                    >
                      Explorer <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Listed Streams & Export Section */}
        <div className="mt-12 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">Streams</h2>
              <p className="mt-1 text-sm text-slate-400">
                {isConnected
                  ? `${loadedStreams.length} stream${loadedStreams.length === 1 ? '' : 's'} loaded`
                  : 'Connect a wallet to view and export streams'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/streams/my"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-900 hover:text-white"
              >
                <Inbox className="h-4 w-4" aria-hidden="true" /> My streams
              </Link>
              <Button
                type="button"
                onClick={handleExportCsv}
                disabled={loadedStreams.length === 0 || !isConnected}
                variant="secondary"
                className="inline-flex items-center gap-2"
                aria-label="Export CSV"
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </div>

          <DataTable
            caption={
              activeAddress
                ? `Streams for ${formatAddress(activeAddress, 6)}`
                : 'Streams for the connected wallet'
            }
            columns={streamColumns}
            rows={loadedStreams}
            getRowKey={(item) => item.id}
            loading={listingLoading}
            loadingState={
              <div className="space-y-3 rounded-2xl border border-slate-900 bg-slate-950/40 p-6">
                <Skeleton height="1.5rem" width="30%" rounded="sm" />
                <Skeleton height="1rem" width="60%" rounded="sm" />
              </div>
            }
            emptyState={
              isConnected ? (
                <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-8 text-center">
                  <p className="text-sm text-slate-400">No streams found for this address.</p>
                </div>
              ) : null
            }
            className="font-mono"
          />

          {!listingLoading && loadedStreams.length > 0 && (
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
                  {loadingMore ? 'Loading more streams...' : 'Load more'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">End of list — all streams loaded</p>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
