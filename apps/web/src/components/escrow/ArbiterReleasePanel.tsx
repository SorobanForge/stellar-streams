'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  Search,
  Shield,
  Wallet,
} from 'lucide-react';
import { Alert, Button, Card, Input } from '@stellar-starter-kit/ui';
import type { EscrowClient } from '@stellar-starter-kit/sdk';
import type { Escrow, EscrowSchedule } from '@stellar-starter-kit/types';
import {
  formatEscrowAmount,
  getLiveEscrowTotals,
  getReleaseEligibility,
  nextReleasableMilestone,
} from '../../lib/escrow-milestones';

export interface ArbiterReleasePanelProps {
  client: EscrowClient;
  isConnected: boolean;
  activeAddress: string | null;
  expertUrl: string;
  /** Escrow to load as soon as the panel mounts, e.g. one just created. */
  initialEscrowId?: string;
  nowSeconds?: () => number;
}

/**
 * Milestone release flow for the escrow arbiter.
 *
 * Loads an escrow and its schedule, shows the live remaining and refundable
 * amounts, and releases exactly one milestone at a time. A release always goes
 * through an explicit confirmation step: money leaves the contract immediately
 * and cannot be undone, so a stray click must not be enough.
 */
export function ArbiterReleasePanel({
  client,
  isConnected,
  activeAddress,
  expertUrl,
  initialEscrowId = '',
  nowSeconds = () => Math.floor(Date.now() / 1000),
}: ArbiterReleasePanelProps) {
  const [escrowId, setEscrowId] = useState(initialEscrowId);
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [schedule, setSchedule] = useState<EscrowSchedule | null>(null);
  const [contractRemaining, setContractRemaining] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(
    async (idStr: string) => {
      const trimmed = idStr.trim();
      if (!trimmed) {
        setError('Enter an escrow id to load.');
        return;
      }
      let id: bigint;
      try {
        id = BigInt(trimmed);
      } catch {
        setError('Escrow id must be a whole number.');
        return;
      }

      setLoading(true);
      setError(null);
      setConfirming(null);
      try {
        const loaded = await client.getEscrow(id);
        if (!loaded) {
          setEscrow(null);
          setSchedule(null);
          setContractRemaining(null);
          setError(`No escrow found with id ${trimmed}.`);
          return;
        }
        const milestones = await client.getMilestones(id);
        setEscrow(loaded);
        setSchedule(milestones);
        // The contract's own remaining view is authoritative; a failure here
        // (e.g. an escrow without a schedule) must not hide the escrow itself.
        setContractRemaining(await client.getRemainingAmount(id).catch(() => null));
      } catch (err) {
        setEscrow(null);
        setSchedule(null);
        setContractRemaining(null);
        setError(err instanceof Error ? err.message : 'Failed to load the escrow.');
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (initialEscrowId) void load(initialEscrowId);
  }, [initialEscrowId, load]);

  const now = nowSeconds();
  const totals = useMemo(
    () => (escrow ? getLiveEscrowTotals(escrow, schedule) : null),
    [escrow, schedule],
  );
  const eligibility = useMemo(
    () => (escrow ? getReleaseEligibility(escrow, schedule, activeAddress, now) : null),
    [activeAddress, escrow, now, schedule],
  );
  const nextIndex = nextReleasableMilestone(schedule);
  const remaining = contractRemaining ?? totals?.remainingAmount ?? null;

  const release = async (index: number) => {
    if (!escrow || !activeAddress) return;
    setReleasing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await client.releaseMilestone({
        id: escrow.id,
        index,
        caller: activeAddress,
      });
      const milestone = schedule?.milestones[index];
      // Reflect the release immediately so the remaining and refundable cards
      // move without waiting for the refetch, then reconcile with the chain.
      if (milestone && schedule) {
        setSchedule({
          milestones: schedule.milestones.map((entry) =>
            entry.index === index ? { ...entry, released: true } : entry,
          ),
          releasedAmount: schedule.releasedAmount + milestone.amount,
        });
        setContractRemaining((current) =>
          current !== null ? current - milestone.amount : current,
        );
      }
      setSuccess(
        `Milestone #${index + 1}${milestone ? ` (${formatEscrowAmount(milestone.amount)})` : ''} released. Tx ${result.hash.slice(0, 10)}…`,
      );
      setConfirming(null);
      await load(escrow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release the milestone.');
    } finally {
      setReleasing(false);
    }
  };

  return (
    <Card className="space-y-6" data-testid="arbiter-release-panel">
      <div>
        <h3 className="text-foreground flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
          Release milestones
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Only the arbiter can release from this panel. Each release pays one milestone to the
          recipient and cannot be undone.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load(escrowId);
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <Input
            label="Escrow id"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 12"
            value={escrowId}
            onChange={(event) => setEscrowId(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading || !isConnected} loading={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Load escrow
        </Button>
      </form>

      {!isConnected ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4" aria-hidden="true" /> Connect the arbiter wallet to load and
          release milestones.
        </p>
      ) : null}

      {error ? (
        <Alert tone="error" title="Release failed">
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert tone="success" title="Milestone released">
          {success}
        </Alert>
      ) : null}

      {escrow ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="border-border rounded-xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Remaining</p>
              <p className="text-foreground mt-1 font-mono text-lg" data-testid="remaining-amount">
                {remaining !== null ? formatEscrowAmount(remaining) : '—'}
              </p>
            </div>
            <div className="border-border rounded-xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Refundable</p>
              <p className="text-foreground mt-1 font-mono text-lg" data-testid="refundable-amount">
                {totals ? formatEscrowAmount(totals.refundableAmount) : '—'}
              </p>
            </div>
            <div className="border-border rounded-xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Released</p>
              <p className="text-foreground mt-1 font-mono text-lg">
                {totals ? formatEscrowAmount(totals.releasedAmount) : '—'}
              </p>
            </div>
            <div className="border-border rounded-xl border p-4">
              <p className="text-muted-foreground text-xs uppercase">Status</p>
              <p className="text-foreground mt-1 text-lg font-semibold capitalize">
                {escrow.status}
              </p>
            </div>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Deadline{' '}
              {new Date(Number(escrow.deadline) * 1000).toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Payee{' '}
              <span className="font-mono">{escrow.payee.slice(0, 8)}…</span>
            </span>
            <a
              href={`${expertUrl}/contract/${escrow.token}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-cyan-700 hover:underline dark:text-cyan-400"
            >
              Token <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={() => void load(escrow.id)}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
            </button>
          </div>

          {schedule ? (
            <ol className="space-y-2">
              {schedule.milestones.map((milestone) => {
                const isNext = milestone.index === nextIndex;
                const canRelease =
                  isNext && eligibility?.allowed === true && !releasing && confirming === null;
                return (
                  <li
                    key={milestone.index}
                    data-milestone-index={milestone.index}
                    className="border-border bg-secondary/40 rounded-xl border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground font-mono text-sm">
                          #{milestone.index + 1}
                        </span>
                        <span className="text-foreground font-mono text-sm">
                          {formatEscrowAmount(milestone.amount)}
                        </span>
                        {milestone.released ? (
                          <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Released
                          </span>
                        ) : (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-bold">
                            Pending
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setConfirming(milestone.index)}
                        disabled={!canRelease}
                      >
                        <Play className="h-4 w-4" aria-hidden="true" /> Release
                      </Button>
                    </div>

                    {confirming === milestone.index ? (
                      <div
                        className="mt-4 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
                        data-testid="release-confirmation"
                      >
                        <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>
                            Release milestone #{milestone.index + 1} of{' '}
                            <strong>{formatEscrowAmount(milestone.amount)}</strong> to{' '}
                            <span className="font-mono">{escrow.payee}</span>? This sends funds
                            immediately and cannot be undone.
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void release(milestone.index)}
                            disabled={releasing}
                          >
                            {releasing ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Play className="h-4 w-4" aria-hidden="true" />
                            )}
                            Confirm release
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirming(null)}
                            disabled={releasing}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">
              This escrow has no milestone schedule; release it as a whole from the Manage tab.
            </p>
          )}

          {eligibility && !eligibility.allowed ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4" aria-hidden="true" /> {eligibility.reason}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default ArbiterReleasePanel;
