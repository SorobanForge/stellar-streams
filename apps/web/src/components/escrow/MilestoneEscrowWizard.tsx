'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Wallet,
} from 'lucide-react';
import { Alert, Button, Card, Input } from '@stellar-starter-kit/ui';
import type { EscrowClient } from '@stellar-starter-kit/sdk';
import { normalizeEscrowSchedule } from '@stellar-starter-kit/types';
import {
  MAX_MILESTONES,
  MIN_MILESTONES,
  WIZARD_STEPS,
  allocatedMilestoneAmount,
  amountToBaseUnits,
  describeWizardStep,
  formatEscrowAmount,
  getLiveEscrowTotals,
  parseDeadlineValue,
  splitEvenly,
  toDeadlineValue,
  validateEscrowDetails,
  validateMilestoneSchedule,
  type EscrowDetailsValues,
  type EscrowWizardStep,
} from '../../lib/escrow-milestones';

export interface MilestoneEscrowWizardProps {
  /** SDK client bound to the deployed escrow contract. */
  client: EscrowClient;
  /** Token the escrow locks; the configured token contract (native XLM SAC by default). */
  tokenContractId: string;
  isConnected: boolean;
  activeAddress: string | null;
  /** Called with the new escrow once both transactions confirm. */
  onCreated?: (created: { id: bigint; hash: string }) => void;
  /** Clock override for tests; defaults to the real clock. */
  nowSeconds?: () => number;
}

const DAY_SECONDS = 86_400;

/**
 * Multi-step escrow creation wizard.
 *
 * Step 1 collects the recipient, arbiter, amount and deadline; step 2 the
 * milestone schedule; step 3 reviews both before submitting. The contract
 * assigns the escrow id, so creation is two transactions (create, then
 * `set_milestones`) and the payer signs both — `createMilestoneEscrow` in the
 * SDK owns that sequence.
 *
 * Amounts and the deadline are validated against the contract's own rules
 * before either transaction is built, so a rejected schedule is caught in the
 * wizard instead of costing a fee.
 */
export function MilestoneEscrowWizard({
  client,
  tokenContractId,
  isConnected,
  activeAddress,
  onCreated,
  nowSeconds = () => Math.floor(Date.now() / 1000),
}: MilestoneEscrowWizardProps) {
  const [step, setStep] = useState<EscrowWizardStep>('details');
  const [details, setDetails] = useState<EscrowDetailsValues>({
    recipient: '',
    arbiter: '',
    amount: '100',
    deadline: toDeadlineValue(nowSeconds() + 7 * DAY_SECONDS),
  });
  const [milestoneValues, setMilestoneValues] = useState<string[]>(['', '']);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: bigint; hash: string } | null>(null);

  const detailsErrors = useMemo(
    () => validateEscrowDetails(details, nowSeconds()),
    [details, nowSeconds],
  );
  const escrowAmount = useMemo(() => amountToBaseUnits(details.amount), [details.amount]);

  const schedule = useMemo(
    () => validateMilestoneSchedule(escrowAmount, milestoneValues),
    [escrowAmount, milestoneValues],
  );
  const allocated = allocatedMilestoneAmount(milestoneValues);

  const detailsValid = Object.keys(detailsErrors).length === 0;
  const milestonesValid = schedule.amounts !== null;

  const setDetail = (key: keyof EscrowDetailsValues, value: string) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const setMilestone = (index: number, value: string) => {
    setMilestoneValues((current) => current.map((entry, i) => (i === index ? value : entry)));
  };

  const addMilestone = () => {
    setMilestoneValues((current) =>
      current.length >= MAX_MILESTONES ? current : [...current, ''],
    );
  };

  const removeMilestone = (index: number) => {
    setMilestoneValues((current) =>
      current.length <= MIN_MILESTONES ? current : current.filter((_, i) => i !== index),
    );
  };

  const splitEvenlyAcrossRows = () => {
    if (escrowAmount === null) return;
    const parts = splitEvenly(escrowAmount, milestoneValues.length);
    setMilestoneValues(parts.map((part) => formatEscrowAmount(part)));
  };

  const goNext = () => {
    setError(null);
    if (step === 'details') {
      if (!detailsValid) {
        setError('Fix the highlighted agreement details before continuing.');
        return;
      }
      setStep('milestones');
      return;
    }
    if (step === 'milestones') {
      if (!milestonesValid) {
        setError(schedule.formError ?? 'Fix the highlighted milestones before continuing.');
        return;
      }
      setStep('review');
    }
  };

  const goBack = () => {
    setError(null);
    setStep(step === 'review' ? 'milestones' : 'details');
  };

  const submit = async () => {
    setError(null);
    if (!isConnected || !activeAddress) {
      setError('Connect a wallet to create the escrow.');
      return;
    }
    if (!detailsValid) {
      setError('Fix the agreement details before submitting.');
      setStep('details');
      return;
    }
    if (schedule.amounts === null || escrowAmount === null) {
      setError(schedule.formError ?? 'Fix the milestone schedule before submitting.');
      setStep('milestones');
      return;
    }
    const deadline = parseDeadlineValue(details.deadline);
    if (deadline === null) {
      setError('Enter a valid deadline.');
      setStep('details');
      return;
    }

    setPending(true);
    try {
      const result = await client.createMilestoneEscrow({
        payer: activeAddress,
        payee: details.recipient.trim(),
        arbiter: details.arbiter.trim(),
        token: tokenContractId,
        amount: escrowAmount.toString(),
        deadline: String(deadline),
        milestoneAmounts: schedule.amounts,
      });
      if (!('id' in result)) {
        throw new Error(
          'The escrow simulation built no transaction; submit from a connected wallet.',
        );
      }
      const value = { id: result.id, hash: result.hash };
      setCreated(value);
      onCreated?.(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the escrow.');
    } finally {
      setPending(false);
    }
  };

  const draftSchedule = useMemo(
    () =>
      schedule.amounts
        ? normalizeEscrowSchedule(
            schedule.amounts,
            schedule.amounts.map(() => false),
          )
        : null,
    [schedule.amounts],
  );
  const totals = useMemo(
    () =>
      escrowAmount !== null
        ? getLiveEscrowTotals({ amount: escrowAmount.toString() }, draftSchedule)
        : null,
    [draftSchedule, escrowAmount],
  );

  const stepIndex = WIZARD_STEPS.indexOf(step);

  return (
    <Card className="space-y-6" data-testid="milestone-escrow-wizard">
      <div>
        <h3 className="text-foreground flex items-center gap-2 text-lg font-semibold">
          <Coins className="h-5 w-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
          Create a milestone escrow
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Lock funds against a schedule and let the arbiter release each milestone as work lands.
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-3 text-xs font-semibold tracking-wide uppercase">
        {WIZARD_STEPS.map((entry, index) => {
          const state = index === stepIndex ? 'current' : index < stepIndex ? 'done' : 'todo';
          return (
            <li
              key={entry}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={
                state === 'current'
                  ? 'flex items-center gap-1.5 text-purple-700 dark:text-purple-300'
                  : state === 'done'
                    ? 'flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400'
                    : 'text-muted-foreground flex items-center gap-1.5'
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px]">
                {state === 'done' ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
              </span>
              {describeWizardStep(entry)}
              {index < WIZARD_STEPS.length - 1 ? (
                <span className="text-border ml-1" aria-hidden="true">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {created ? (
        <Alert tone="success" title="Escrow created">
          Escrow <span className="font-mono">#{created.id.toString()}</span> now has a milestone
          schedule. Fund it from the payer wallet, then the arbiter can release milestones from the
          release panel.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" title="Cannot continue">
          {error}
        </Alert>
      ) : null}

      {step === 'details' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Recipient (payee)"
            placeholder="G... or C..."
            value={details.recipient}
            error={detailsErrors.recipient}
            onChange={(event) => setDetail('recipient', event.target.value)}
            autoComplete="off"
          />
          <Input
            label="Arbiter"
            placeholder="G... or C..."
            value={details.arbiter}
            error={detailsErrors.arbiter}
            onChange={(event) => setDetail('arbiter', event.target.value)}
            autoComplete="off"
          />
          <Input
            label="Amount"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={details.amount}
            error={detailsErrors.amount}
            onChange={(event) => setDetail('amount', event.target.value)}
          />
          <Input
            label="Deadline"
            type="datetime-local"
            value={details.deadline}
            error={detailsErrors.deadline}
            onChange={(event) => setDetail('deadline', event.target.value)}
          />
          <p className="text-muted-foreground text-xs sm:col-span-2">
            Funds stay locked in the escrow contract. Before the deadline the arbiter can release
            milestones; after it, the payer can reclaim whatever is unreleased.
          </p>
        </div>
      ) : null}

      {step === 'milestones' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Split the escrow across at least {MIN_MILESTONES} milestones. The amounts must add up
              exactly to the escrow total.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={splitEvenlyAcrossRows}
              disabled={escrowAmount === null}
            >
              Split evenly
            </Button>
          </div>

          <div className="space-y-3">
            {milestoneValues.map((value, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex-1">
                  <Input
                    label={`Milestone ${index + 1}`}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={value}
                    error={schedule.errors[index] ?? undefined}
                    onChange={(event) => setMilestone(index, event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove milestone ${index + 1}`}
                  onClick={() => removeMilestone(index)}
                  disabled={milestoneValues.length <= MIN_MILESTONES}
                  className="border-border text-muted-foreground hover:bg-secondary hover:text-foreground mt-6 rounded-lg border p-2 transition disabled:pointer-events-none disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addMilestone}
            disabled={milestoneValues.length >= MAX_MILESTONES}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add milestone
          </Button>

          <dl className="border-border bg-secondary/60 grid grid-cols-1 gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Escrow amount</dt>
              <dd className="text-foreground mt-1 font-mono">
                {escrowAmount !== null ? formatEscrowAmount(escrowAmount) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Allocated</dt>
              <dd className="text-foreground mt-1 font-mono">{formatEscrowAmount(allocated)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Unallocated</dt>
              <dd
                data-testid="unallocated"
                className={
                  escrowAmount !== null && allocated > escrowAmount
                    ? 'mt-1 font-mono text-rose-600 dark:text-rose-400'
                    : 'text-foreground mt-1 font-mono'
                }
              >
                {escrowAmount === null
                  ? '—'
                  : formatEscrowAmount(
                      allocated > escrowAmount
                        ? allocated - escrowAmount
                        : escrowAmount - allocated,
                    )}
              </dd>
            </div>
          </dl>

          {schedule.formError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
              {schedule.formError}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 'review' ? (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Recipient</dt>
              <dd className="text-foreground mt-1 font-mono text-xs break-all">
                {details.recipient.trim()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Arbiter</dt>
              <dd className="text-foreground mt-1 font-mono text-xs break-all">
                {details.arbiter.trim()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Amount</dt>
              <dd className="text-foreground mt-1 font-mono">
                {escrowAmount !== null ? formatEscrowAmount(escrowAmount) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs uppercase">Deadline</dt>
              <dd className="text-foreground mt-1">
                {parseDeadlineValue(details.deadline) !== null
                  ? new Date(parseDeadlineValue(details.deadline)! * 1000).toLocaleString()
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="border-border bg-secondary/60 rounded-xl border p-4">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Milestone schedule
            </p>
            <ol className="text-foreground mt-2 space-y-1 font-mono text-sm">
              {(schedule.amounts ?? []).map((amount, index) => (
                <li key={index} className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">#{index + 1}</span>
                  <span>{formatEscrowAmount(amount)}</span>
                </li>
              ))}
            </ol>
          </div>

          {totals ? (
            <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="wizard-totals">
              <div className="border-border rounded-xl border p-4">
                <dt className="text-muted-foreground text-xs uppercase">Remaining to release</dt>
                <dd className="text-foreground mt-1 font-mono text-lg">
                  {formatEscrowAmount(totals.remainingAmount)}
                </dd>
              </div>
              <div className="border-border rounded-xl border p-4">
                <dt className="text-muted-foreground text-xs uppercase">
                  Refundable before release
                </dt>
                <dd className="text-foreground mt-1 font-mono text-lg">
                  {formatEscrowAmount(totals.refundableAmount)}
                </dd>
              </div>
            </dl>
          ) : null}

          {!isConnected ? (
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
              <Wallet className="h-4 w-4" aria-hidden="true" /> Connect the payer wallet to sign
              both transactions.
            </p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> The payer signs the create and
              schedule transactions; no funds move until the escrow is funded.
            </p>
          )}
        </div>
      ) : null}

      <div className="border-border flex flex-wrap justify-between gap-3 border-t pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={goBack}
          disabled={step === 'details' || pending}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Button>
        {step === 'review' ? (
          <Button type="button" onClick={submit} loading={pending} disabled={!!created}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Create escrow
          </Button>
        ) : (
          <Button type="button" onClick={goNext} disabled={pending}>
            Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </Card>
  );
}

export default MilestoneEscrowWizard;
