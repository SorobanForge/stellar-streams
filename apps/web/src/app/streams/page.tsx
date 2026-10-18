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
  Play,
  Wallet,
} from 'lucide-react';
import { useWallet } from '@stellar-starter-kit/wallets';
import { StreamsClient, type TokenMetadata } from '@stellar-starter-kit/sdk';
import { getStreamStatus, type Stream } from '@stellar-starter-kit/types';
import {
  formatAddress,
  formatTokenAmount,
  parseTokenAmount,
  computeProgressBps,
  computeClaimable,
  computeProtocolFee,
  formatBps,
  formatDuration,
} from '@stellar-starter-kit/utils';
import Header from '../../components/Header';
import Footer from '../../components/Footer';

// framer-motion stays out of the initial route bundle; the banner only loads
// when an error/success message is shown.
const NotificationBanner = dynamic(() => import('../../components/NotificationBanner'), {
  ssr: false,
});

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const CONTRACT_ID = process.env.NEXT_PUBLIC_STREAM_CONTRACT_ID ?? '';
// Testnet native XLM SAC; any SEP-41 token contract id works.
const DEFAULT_TOKEN =
  process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID ||
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const EXPERT_URL = process.env.NEXT_PUBLIC_STELLAR_EXPERT_URL ?? 'https://stellar.expert';

const DAY = 86_400;

export default function StreamsDashboard() {
  const { activeAddress, isConnected, isConnecting, connect, disconnect, signTransaction } =
    useWallet();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create form.
  const [recipient, setRecipient] = useState('');
  const [token, setToken] = useState(DEFAULT_TOKEN);
  const [amount, setAmount] = useState('100');
  const [durationDays, setDurationDays] = useState('30');
  const [cliffDays, setCliffDays] = useState('0');

  // Lookup.
  const [lookupId, setLookupId] = useState('');
  const [stream, setStream] = useState<Stream | null>(null);
  const [claimable, setClaimable] = useState<bigint>(0n);
  const [feeBps, setFeeBps] = useState<number>(0);
  const [streamToken, setStreamToken] = useState<TokenMetadata | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);
  const [feeBps, setFeeBps] = useState<number | null>(null);

  const client = useMemo(
    () =>
      new StreamsClient({
        contractId: CONTRACT_ID,
        rpcUrl: RPC_URL,
        networkPassphrase: NETWORK_PASSPHRASE,
        publicKey: activeAddress ?? undefined,
        signTransaction: async (xdr: string) => signTransaction(xdr),
      }),
    [activeAddress, signTransaction],
  );

  const notify = useCallback((kind: 'success' | 'error', message: string) => {
    if (kind === 'success') {
      setSuccess(message);
      setError(null);
    } else {
      setError(message);
      setSuccess(null);
    }
  }, []);

  const loadStream = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoadingStream(true);
      try {
        const found = await client.getStream(id);
        setStream(found);
        const now = Math.floor(Date.now() / 1000);
        setClaimable(found ? computeClaimable(found, now) : 0n);
        const config = await client.getConfig().catch(() => null);
        setFeeBps(config ? config.feeBps : 0);
        // Amounts are in the token's smallest unit; read its decimals to display them.
        setStreamToken(found ? await client.getTokenMetadata(found.token).catch(() => null) : null);
        // Fetch protocol config for feeBps
        const config = await client.getConfig().catch(() => null);
        setFeeBps(config ? config.feeBps : 0);
        if (!found) notify('error', `No stream found with id ${id}.`);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Failed to load stream.');
      } finally {
        setLoadingStream(false);
      }
    },
    [client, notify],
  );

  const runAction = useCallback(
    async (label: string, action: () => Promise<{ hash: string }>, id: string) => {
      setBusy(true);
      setSuccess(null);
      setError(null);
      try {
        const { hash } = await action();
        const expertLink = `${EXPERT_URL}/tx/${hash}`;
        notify(
          'success',
          `${label} submitted successfully. Tx ${formatAddress(hash, 6)} ${expertLink ? '• <a href="' + expertLink + '" target="_blank" rel="noreferrer">View on explorer</a>' : ''}`,
        );
        await loadStream(id);
      } catch (err) {
        notify('error', err instanceof Error ? err.message : `${label} failed.`);
      } finally {
        setBusy(false);
      }
    },
    [loadStream, notify],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isConnected || !activeAddress) {
      notify('error', 'Connect a wallet to create a stream.');
      return;
    }
    if (!CONTRACT_ID) {
      notify('error', 'No stream contract configured. Set NEXT_PUBLIC_STREAM_CONTRACT_ID.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now;
      const endTime = now + Math.floor(Number(durationDays) * DAY);
      const cliffTime = now + Math.floor(Number(cliffDays) * DAY);

      const { decimals } = await client.getTokenMetadata(token.trim());
      const { hash } = await client.createStream({
        sender: activeAddress,
        recipient,
        token: token.trim(),
        amount: parseTokenAmount(amount, decimals).toString(),
        startTime,
        endTime,
        cliffTime,
      });
      const expertLink = `${EXPERT_URL}/tx/${hash}`;
      notify(
        'success',
        `Stream created. Tx ${formatAddress(hash, 6)} ${expertLink ? '• <a href="' + expertLink + '" target="_blank" rel="noreferrer">View on explorer</a>' : ''}`,
      );
      setRecipient('');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to create stream.');
    } finally {
      setBusy(false);
    }
  };

  const formatAmount = (raw: bigint | string) =>
    streamToken
      ? `${formatTokenAmount(raw, streamToken.decimals)} ${streamToken.symbol}`
      : `${raw.toString()} (base units)`;

  const feeBpsValue = feeBps ?? 0;
  const feeAmount = feeBpsValue > 0 ? (claimable * BigInt(feeBpsValue)) / 10000n : 0n;
  const netAmount = claimable - feeAmount;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const status = stream ? getStreamStatus(stream, nowSeconds) : null;
  const progress = stream
    ? computeProgressBps(
        {
          totalAmount: BigInt(stream.totalAmount),
          startTime: stream.startTime,
          endTime: stream.endTime,
          cliffTime: stream.cliffTime,
        },
        nowSeconds,
      )
    : 0;

  const protocolFee = stream ? computeProtocolFee(claimable, feeBps) : 0n;
  const netClaimable = claimable - protocolFee;

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

        {!CONTRACT_ID && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Stream contract not configured</p>
              <p className="mt-1 font-light text-amber-200/80">
                Deploy the <code className="font-mono">stream</code> contract and set{' '}
                <code className="font-mono">NEXT_PUBLIC_STREAM_CONTRACT_ID</code> to enable the
                dashboard.
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
            <button
              onClick={() =>
                connect('freighter').catch(() => notify('error', 'Connection failed.'))
              }
              disabled={isConnecting}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
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

            <label className="block">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Recipient
              </span>
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="G..."
                required
                className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Token contract
              </span>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="C..."
                required
                className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Amount
                </span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Duration (days)
                </span>
                <input
                  type="number"
                  min="1"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                Cliff (days, 0 = none)
              </span>
              <input
                type="number"
                min="0"
                value={cliffDays}
                onChange={(e) => setCliffDays(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
              />
            </label>

            <button
              type="submit"
              disabled={busy || !isConnected || !CONTRACT_ID}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Create stream
            </button>
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

              {stream && (
                <div className="mt-6 space-y-4 rounded-xl border border-slate-900 bg-slate-950/60 p-5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Stream #{stream.id}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        status === 'streaming'
                          ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-300'
                          : status === 'completed'
                            ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                            : status === 'cancelled'
                              ? 'border border-rose-500/20 bg-rose-500/10 text-rose-300'
                              : 'border border-slate-700 bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all"
                      style={{ width: `${(progress / 100).toFixed(1)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>{formatBps(progress)} vested</span>
                    <span>
                      {formatDuration(Math.max(0, stream.endTime - nowSeconds))} remaining
                    </span>
                  </div>

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
                    <button
                      onClick={() =>
                        runAction('Withdraw', () => client.withdraw(stream.id), stream.id)
                      }
                      disabled={busy || !isConnected || claimable <= 0n || stream.cancelled}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Droplets className="h-3.5 w-3.5 text-cyan-400" /> Withdraw
                    </button>
                    <button
                      onClick={() => runAction('Cancel', () => client.cancel(stream.id), stream.id)}
                      disabled={busy || !isConnected || stream.cancelled}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2 font-semibold text-slate-200 transition hover:bg-slate-900 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Ban className="h-3.5 w-3.5 text-rose-400" /> Cancel
                    </button>
                    <a
                      href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
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
      </main>
      <Footer />
    </div>
  );
}
