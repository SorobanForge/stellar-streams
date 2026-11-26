'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@stellar-starter-kit/wallets';
import { EscrowClient } from '@stellar-starter-kit/contracts';
import { EscrowClient as EscrowSdkClient } from '@stellar-starter-kit/sdk';
import { Footer } from '@stellar-starter-kit/ui';
import type { EnvironmentConfig } from '@stellar-starter-kit/config';
import { environmentConfig, environmentErrors } from '../../lib/environment';
import ConfigurationError from '../../components/ConfigurationError';
import { AppHeader } from '../../components/AppHeader';
import { MilestoneEscrowWizard } from '../../components/escrow/MilestoneEscrowWizard';
import { ArbiterReleasePanel } from '../../components/escrow/ArbiterReleasePanel';
import { probeMilestoneSupport, type MilestoneSupport } from '../../lib/escrow-milestones';
import { normalizeEscrow, type RawEscrow, type Escrow } from '@stellar-starter-kit/types';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  Coins,
  ArrowRightLeft,
  Plus,
  Play,
  Ban,
  Undo2,
  Search,
  Milestone,
} from 'lucide-react';
import Link from 'next/link';

// framer-motion stays out of the initial route bundle; these load on demand.
const NotificationBanner = dynamic(() => import('../../components/NotificationBanner'), {
  ssr: false,
});
const EscrowLookupResult = dynamic(() => import('../../components/EscrowLookupResult'), {
  ssr: false,
});

interface LogEntry {
  id: string;
  type: 'create' | 'fund' | 'release' | 'refund' | 'cancel' | 'fetch';
  timestamp: Date;
  hash?: string;
  status: 'pending' | 'success' | 'error';
  details: string;
}

/**
 * Route entry point: validates the environment once, then renders the demo.
 * A failed validation replaces the page instead of silently using the Testnet
 * defaults, which would point writes at the wrong network.
 */
export default function EscrowPage() {
  const config = environmentConfig;
  if (!config) {
    return <ConfigurationError errors={environmentErrors} />;
  }
  return <EscrowDemo config={config} />;
}

function EscrowDemo({ config }: { config: EnvironmentConfig }) {
  const {
    sorobanRpcUrl,
    networkPassphrase,
    escrowContractId,
    tokenContractId,
    expertUrl,
    network,
  } = config;
  // An unset escrow id leaves the page in a read-only "not configured" state
  // rather than falling back to a contract id from another network.
  const contractId = escrowContractId ?? '';
  const contractConfigured = contractId.length > 0;
  const networkLabel = network.charAt(0).toUpperCase() + network.slice(1);

  const {
    activeAddress,
    isConnected,
    isConnecting,
    activeProvider,
    connect,
    disconnect,
    signTransaction,
  } = useWallet();

  // State Variables
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'lookup' | 'milestones'>(
    'create',
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Create Escrow Form State
  const [createPayee, setCreatePayee] = useState<string>('');
  const [createArbiter, setCreateArbiter] = useState<string>('');
  const [createToken, setCreateToken] = useState<string>(tokenContractId); // Native XLM
  const [createAmount, setCreateAmount] = useState<string>('10'); // in XLM
  const [createDeadline, setCreateDeadline] = useState<string>('3600'); // seconds from now

  // Manage Escrow State
  const [manageId, setManageId] = useState<string>('');
  const [manageCaller, setManageCaller] = useState<string>('');

  // Lookup Escrow State
  const [lookupId, setLookupId] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<Escrow | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);

  // Milestone escrow state
  const [milestoneEscrowId, setMilestoneEscrowId] = useState<string>('');
  const [milestoneSupport, setMilestoneSupport] = useState<MilestoneSupport | 'checking' | 'idle'>(
    'idle',
  );

  const addLog = useCallback(
    (type: LogEntry['type'], status: LogEntry['status'], details: string, hash?: string) => {
      const newEntry: LogEntry = {
        id: Math.random().toString(36).substring(7),
        type,
        timestamp: new Date(),
        status,
        details,
        hash,
      };
      setLogs((prev) => [newEntry, ...prev.slice(0, 19)]);
    },
    [],
  );

  // Helper to instantiate client. The guard keeps every write path from
  // constructing a client with an empty contract id when the page is deployed
  // without an escrow contract.
  const getClient = useCallback(() => {
    if (!contractId) {
      throw new Error('No escrow contract configured. Set the escrow contract id in your env.');
    }
    return new EscrowClient.Client({
      contractId,
      rpcUrl: sorobanRpcUrl,
      networkPassphrase,
      publicKey: activeAddress || undefined,
      signTransaction: async (txXdr) => {
        const signedTxXdr = await signTransaction(txXdr);
        return { signedTxXdr };
      },
    });
  }, [activeAddress, signTransaction, contractId, sorobanRpcUrl, networkPassphrase]);

  // Typed SDK client used by the milestone wizard and the arbiter release
  // panel. The rest of the page still uses the generated bindings.
  const milestoneClient = useMemo(
    () =>
      new EscrowSdkClient({
        contractId,
        rpcUrl: sorobanRpcUrl,
        networkPassphrase,
        publicKey: activeAddress ?? undefined,
        signTransaction: async (txXdr: string) => signTransaction(txXdr),
      }),
    [activeAddress, signTransaction, contractId, sorobanRpcUrl, networkPassphrase],
  );

  // Gate the milestone UI on the contract feature itself: `get_milestones` only
  // exists once the milestone-release contract change is deployed.
  useEffect(() => {
    if (!contractConfigured || !isConnected) {
      setMilestoneSupport('idle');
      return;
    }
    let cancelled = false;
    setMilestoneSupport('checking');
    void probeMilestoneSupport(milestoneClient).then((support) => {
      if (!cancelled) setMilestoneSupport(support);
    });
    return () => {
      cancelled = true;
    };
  }, [contractConfigured, isConnected, milestoneClient]);

  // Set default caller to active address when it changes
  useEffect(() => {
    if (activeAddress) {
      setManageCaller(activeAddress);
    }
  }, [activeAddress]);

  // Handle Create Escrow
  const handleCreateEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return;
    }
    if (!contractId) {
      setError('No escrow contract configured. Set the escrow contract id in your env.');
      return;
    }

    // Convert XLM to Stroops (7 decimals)
    const amountInStroops = BigInt(parseFloat(createAmount) * 10000000);
    const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + parseInt(createDeadline));

    setError(null);
    setSuccessMessage(null);
    setActionLoading(true);
    addLog('create', 'pending', 'Initiating escrow creation...');

    try {
      const client = getClient();
      const tx = await client.create_escrow({
        payer: activeAddress!,
        payee: createPayee,
        arbiter: createArbiter,
        token: createToken,
        amount: amountInStroops,
        deadline: deadlineTimestamp,
      });

      const result = await tx.signAndSend();
      const txHash = result.sendTransactionResponse?.hash;
      // The contract assigns the id and returns it.
      const escrowId = result.result.unwrap();

      setSuccessMessage(`Escrow ID ${escrowId.toString()} created successfully!`);
      addLog(
        'create',
        'success',
        `Successfully created escrow ${escrowId.toString()} with ${createAmount} XLM.`,
        txHash,
      );
      setLookupId(escrowId.toString());
      // Switch tab to lookup or manage
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setError(msg);
      addLog('create', 'error', `Failed to create escrow: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Fund Escrow
  const handleFundEscrow = async (escrowIdStr: string) => {
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return;
    }

    const escrowId = BigInt(escrowIdStr);
    setError(null);
    setSuccessMessage(null);
    setActionLoading(true);
    addLog('fund', 'pending', `Initiating funding for escrow ID ${escrowId.toString()}...`);

    try {
      const client = getClient();
      const tx = await client.fund_escrow({ id: escrowId });
      const result = await tx.signAndSend();
      const txHash = result.sendTransactionResponse?.hash;

      setSuccessMessage(`Escrow ID ${escrowId.toString()} funded successfully!`);
      addLog('fund', 'success', `Successfully funded escrow ${escrowId.toString()}`, txHash);
      handleLookupEscrow(escrowId.toString(), true);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setError(msg);
      addLog('fund', 'error', `Failed to fund escrow: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Lifecycle Actions (Release, Refund, Cancel)
  const handleLifecycleAction = async (action: 'release' | 'refund' | 'cancel') => {
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return;
    }

    const escrowId = BigInt(manageId);
    setError(null);
    setSuccessMessage(null);
    setActionLoading(true);
    addLog(action, 'pending', `Initiating ${action} for escrow ID ${escrowId.toString()}...`);

    try {
      const client = getClient();
      let tx;

      if (action === 'release') {
        tx = await client.release_escrow({ id: escrowId, caller: manageCaller });
      } else if (action === 'refund') {
        tx = await client.refund_escrow({ id: escrowId, caller: manageCaller });
      } else {
        tx = await client.cancel_escrow({ id: escrowId, caller: manageCaller });
      }

      const result = await tx.signAndSend();
      const txHash = result.sendTransactionResponse?.hash;

      setSuccessMessage(`Escrow ID ${escrowId.toString()} ${action}d successfully!`);
      addLog(
        action,
        'success',
        `Successfully performed ${action} on escrow ${escrowId.toString()}`,
        txHash,
      );
      handleLookupEscrow(escrowId.toString(), true);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Transaction failed';
      setError(msg);
      addLog(action, 'error', `Failed to perform ${action}: ${msg}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Escrow Lookup
  const handleLookupEscrow = async (escrowIdStr: string, silent = false) => {
    if (!escrowIdStr) return;

    const escrowId = BigInt(escrowIdStr);
    if (!silent) {
      setLookupLoading(true);
      setError(null);
      setLookupResult(null);
    }

    try {
      const client = getClient();
      const result = await client.get_escrow({ id: escrowId });

      if (result.result) {
        const data = result.result;
        setLookupResult(
          normalizeEscrow({
            id: BigInt(data.id),
            payer: data.payer,
            payee: data.payee,
            arbiter: data.arbiter,
            token: data.token,
            amount: BigInt(data.amount),
            deadline: BigInt(data.deadline),
            status: Number(data.status),
          } satisfies RawEscrow),
        );

        if (!silent) {
          addLog('fetch', 'success', `Fetched details for escrow ID ${escrowId.toString()}`);
        }
      } else {
        if (!silent) {
          setError('Escrow contract agreement not found.');
          addLog('fetch', 'error', `Escrow ID ${escrowId.toString()} not found`);
        }
        setLookupResult(null);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to query escrow';
      if (!silent) {
        setError(msg);
        addLog('fetch', 'error', `Failed to lookup escrow ${escrowId.toString()}: ${msg}`);
      }
    } finally {
      if (!silent) setLookupLoading(false);
    }
  };

  return (
    <div className="bg-background text-foreground min-h-screen selection:bg-purple-500/30 selection:text-purple-200">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-15%] h-[60%] w-[60%] rounded-full bg-purple-900/10 blur-[150px]"></div>
        <div className="absolute right-[-15%] bottom-[-15%] h-[60%] w-[60%] rounded-full bg-cyan-900/10 blur-[150px]"></div>
      </div>

      <AppHeader />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-12 pb-24">
        <div className="mb-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>

        {!contractConfigured && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Escrow contract not configured</p>
              <p className="mt-1 font-light text-amber-800/80 dark:text-amber-200/80">
                Deploy the <code className="font-mono">escrow</code> contract and set its id in{' '}
                <code className="font-mono">apps/web/.env.local</code> to enable this page.
              </p>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="mb-12 text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-purple-300">
            Escrow Contract Slice
          </span>
          <h1 className="text-foreground mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            Escrow & Arbitrage Management
          </h1>
          <p className="text-muted-foreground mt-3 text-lg font-light">
            Establish trustless token holdbacks, deposit funds, and manage releases/refunds via
            arbiters on Stellar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main Controls Card */}
          <div className="lg:col-span-8">
            <div className="border-border bg-card relative overflow-hidden rounded-2xl border p-8 shadow-2xl">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-cyan-500/5"></div>

              {/* Wallet connection panel */}
              <div className="border-border mb-8 flex items-center justify-between border-b pb-6">
                <div>
                  <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Connection Info
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {isConnected ? (
                      <>
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
                        <span className="text-muted-foreground font-mono">
                          {activeAddress?.substring(0, 8)}...
                          {activeAddress?.substring(activeAddress.length - 8)} ({activeProvider})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                        <span className="text-muted-foreground">Not Connected</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  {isConnected ? (
                    <button
                      onClick={disconnect}
                      className="border-border bg-card text-foreground hover:bg-secondary rounded-lg border px-4 py-1.5 text-xs font-semibold transition-all"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setError(null);
                        try {
                          await connect('freighter');
                        } catch (err: unknown) {
                          console.error(err);
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Failed to connect Freighter wallet.',
                          );
                        }
                      }}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:brightness-110"
                    >
                      {isConnecting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Connect Freighter'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="border-border mb-8 flex border-b">
                <button
                  onClick={() => {
                    setActiveTab('create');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                    activeTab === 'create'
                      ? 'border-purple-500 text-purple-400'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  <Plus className="h-4 w-4" /> Create Escrow
                </button>
                <button
                  onClick={() => {
                    setActiveTab('manage');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                    activeTab === 'manage'
                      ? 'border-purple-500 text-purple-400'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  <ArrowRightLeft className="h-4 w-4" /> Manage (Release/Refund/Cancel)
                </button>
                <button
                  onClick={() => {
                    setActiveTab('lookup');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                    activeTab === 'lookup'
                      ? 'border-purple-500 text-purple-700 dark:text-purple-400'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  <Search className="h-4 w-4" /> Lookup ID
                </button>
                <button
                  onClick={() => {
                    setActiveTab('milestones');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                    activeTab === 'milestones'
                      ? 'border-purple-500 text-purple-700 dark:text-purple-400'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  <Milestone className="h-4 w-4" /> Milestones
                </button>
              </div>

              {/* Tab Content */}
              <div>
                {/* 1. CREATE TAB */}
                {activeTab === 'create' && (
                  <form onSubmit={handleCreateEscrow} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="flex items-end">
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          The escrow id is assigned on-chain: the contract returns the new id once
                          the transaction succeeds.
                        </p>
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Token Contract Address
                        </label>
                        <input
                          type="text"
                          value={createToken}
                          onChange={(e) => setCreateToken(e.target.value)}
                          className="border-input bg-background text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Payee/Beneficiary Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. GB..."
                          value={createPayee}
                          onChange={(e) => setCreatePayee(e.target.value)}
                          className="border-input bg-background text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Arbiter Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. GC..."
                          value={createArbiter}
                          onChange={(e) => setCreateArbiter(e.target.value)}
                          className="border-input bg-background text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Deposit Amount (XLM)
                        </label>
                        <div className="relative mt-2">
                          <input
                            type="number"
                            step="any"
                            value={createAmount}
                            onChange={(e) => setCreateAmount(e.target.value)}
                            className="border-input bg-background text-foreground w-full rounded-xl border py-2.5 pr-12 pl-4 font-mono text-sm focus:border-purple-500 focus:outline-none"
                            required
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-muted-foreground text-xs font-semibold">XLM</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Deadline (Duration from now)
                        </label>
                        <select
                          value={createDeadline}
                          onChange={(e) => setCreateDeadline(e.target.value)}
                          className="border-input bg-background text-foreground mt-2 w-full rounded-xl border px-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                        >
                          <option value="60">1 Minute (Testing)</option>
                          <option value="300">5 Minutes</option>
                          <option value="3600">1 Hour</option>
                          <option value="86400">24 Hours</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-border flex justify-end gap-4 border-t pt-6">
                      <button
                        type="submit"
                        disabled={!isConnected || actionLoading || !contractConfigured}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                      >
                        {actionLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Initialize Escrow
                      </button>
                    </div>
                  </form>
                )}

                {/* 2. MANAGE TAB */}
                {activeTab === 'manage' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Target Escrow ID
                        </label>
                        <input
                          type="number"
                          placeholder="ID to load/manage"
                          value={manageId}
                          onChange={(e) => setManageId(e.target.value)}
                          className="border-input bg-background text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">
                          Signing Caller Address
                        </label>
                        <input
                          type="text"
                          value={manageCaller}
                          onChange={(e) => setManageCaller(e.target.value)}
                          className="border-input bg-background text-foreground placeholder:text-muted-foreground mt-2 w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    {/* Manage quick controls */}
                    <div className="border-border grid grid-cols-1 gap-4 border-t pt-8 sm:grid-cols-4">
                      {/* Fund */}
                      <button
                        onClick={() => handleFundEscrow(manageId)}
                        disabled={!isConnected || actionLoading || !manageId || !contractConfigured}
                        className="border-border bg-card text-foreground hover:bg-secondary flex flex-col items-center justify-center gap-2 rounded-xl border py-4 font-semibold shadow-inner transition-all disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Coins className="h-5 w-5 text-yellow-400" />
                        <span className="text-xs tracking-wider uppercase">Fund Escrow</span>
                      </button>

                      {/* Release */}
                      <button
                        onClick={() => handleLifecycleAction('release')}
                        disabled={!isConnected || actionLoading || !manageId || !contractConfigured}
                        className="border-border bg-card text-foreground hover:bg-secondary flex flex-col items-center justify-center gap-2 rounded-xl border py-4 font-semibold shadow-inner transition-all disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Play className="h-5 w-5 text-emerald-400" />
                        <span className="text-xs tracking-wider uppercase">Release Payee</span>
                      </button>

                      {/* Refund */}
                      <button
                        onClick={() => handleLifecycleAction('refund')}
                        disabled={!isConnected || actionLoading || !manageId || !contractConfigured}
                        className="border-border bg-card text-foreground hover:bg-secondary flex flex-col items-center justify-center gap-2 rounded-xl border py-4 font-semibold shadow-inner transition-all disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Undo2 className="h-5 w-5 text-cyan-400" />
                        <span className="text-xs tracking-wider uppercase">Refund Payer</span>
                      </button>

                      {/* Cancel */}
                      <button
                        onClick={() => handleLifecycleAction('cancel')}
                        disabled={!isConnected || actionLoading || !manageId || !contractConfigured}
                        className="border-border bg-card text-foreground hover:bg-secondary flex flex-col items-center justify-center gap-2 rounded-xl border py-4 font-semibold shadow-inner transition-all disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Ban className="h-5 w-5 text-rose-400" />
                        <span className="text-xs tracking-wider uppercase">Cancel (Payer)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. MILESTONE WIZARD + ARBITER RELEASE */}
                {activeTab === 'milestones' && (
                  <div className="space-y-8">
                    {!contractConfigured ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
                        Configure the escrow contract before creating a milestone escrow.
                      </div>
                    ) : !isConnected ? (
                      <div className="border-border bg-secondary/50 text-muted-foreground rounded-xl border p-4 text-sm">
                        Connect a wallet to use the milestone wizard. The dashboard probes the
                        deployed contract for milestone support once a wallet is connected.
                      </div>
                    ) : milestoneSupport === 'checking' ? (
                      <div className="border-border bg-secondary/50 text-muted-foreground flex items-center gap-2 rounded-xl border p-4 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifying milestone support on
                        the deployed contract…
                      </div>
                    ) : milestoneSupport === 'unsupported' ? (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
                        This escrow contract does not expose milestone releases yet. Deploy the
                        milestone-release contract change, then reload to enable the wizard.
                      </div>
                    ) : milestoneSupport === 'unknown' ? (
                      <div className="border-border bg-secondary/50 text-muted-foreground rounded-xl border p-4 text-sm">
                        Milestone support could not be verified against the RPC endpoint. The wizard
                        stays available; a write on a contract without milestones will fail with a
                        contract error.
                      </div>
                    ) : null}

                    <MilestoneEscrowWizard
                      client={milestoneClient}
                      tokenContractId={tokenContractId}
                      isConnected={isConnected}
                      activeAddress={activeAddress ?? null}
                      onCreated={({ id }) => {
                        setMilestoneEscrowId(id.toString());
                        setLookupId(id.toString());
                      }}
                    />

                    <ArbiterReleasePanel
                      client={milestoneClient}
                      isConnected={isConnected}
                      activeAddress={activeAddress ?? null}
                      expertUrl={expertUrl}
                      initialEscrowId={milestoneEscrowId}
                    />
                  </div>
                )}

                {/* 4. LOOKUP TAB */}
                {activeTab === 'lookup' && (
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <input
                        type="number"
                        placeholder="Search by Escrow ID..."
                        value={lookupId}
                        onChange={(e) => setLookupId(e.target.value)}
                        className="border-input bg-background text-foreground placeholder:text-muted-foreground w-full rounded-xl border px-4 py-2.5 font-mono text-sm focus:border-purple-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleLookupEscrow(lookupId)}
                        disabled={lookupLoading || !lookupId || !contractConfigured}
                        className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-purple-500 disabled:pointer-events-none disabled:opacity-45"
                      >
                        {lookupLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        Lookup
                      </button>
                    </div>

                    {/* Lookup Result Block */}
                    <EscrowLookupResult
                      result={lookupResult}
                      onOpenManage={(id) => {
                        setManageId(id);
                        setActiveTab('manage');
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Status Notifications */}
              <NotificationBanner
                kind={error ? 'error' : successMessage ? 'success' : null}
                message={error ?? successMessage ?? ''}
                title={error ? 'Execution Error' : successMessage ? 'Success' : undefined}
                className="mt-6"
              />
            </div>
          </div>

          {/* Details & Logs Sidebar */}
          <div className="space-y-6 lg:col-span-4">
            {/* Info Box */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <h3 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
                <Shield className="h-4 w-4 text-purple-400" /> Contract Details
              </h3>
              <div className="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase">Contract ID</div>
                  <div className="text-foreground/80 mt-1 break-all transition-colors select-all hover:text-cyan-700 dark:hover:text-cyan-400">
                    {contractId || 'Not configured'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase">Network</div>
                  <div className="text-foreground/80 mt-1">Stellar {networkLabel}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase">Explorer</div>
                  <div className="mt-1">
                    {contractId ? (
                      <a
                        href={`${expertUrl}/contract/${contractId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-700 hover:underline dark:text-cyan-400"
                      >
                        View on Stellar.expert <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not configured</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Logs Window */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <h3 className="text-foreground mb-4 text-sm font-semibold">Event Log</h3>

              <div className="max-h-[350px] scrollbar-thin space-y-3 overflow-y-auto pr-2">
                {logs.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center font-mono text-xs">
                    No logs recorded.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="border-border bg-secondary/50 rounded-lg border p-3.5 font-mono text-xs"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-muted-foreground font-semibold tracking-wider uppercase">
                          {log.type}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-foreground/80 text-xs leading-relaxed">
                        {log.details}
                      </div>
                      {log.status === 'pending' && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-yellow-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Simulating on Soroban...
                        </div>
                      )}
                      {log.status === 'success' && (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Success
                          </span>
                          {log.hash && (
                            <a
                              href={`${expertUrl}/tx/${log.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-[10px]"
                            >
                              Tx Hash <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      )}
                      {log.status === 'error' && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-rose-500">
                          <AlertCircle className="h-3 w-3" /> Error
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
