'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useWallet } from '@stellar-starter-kit/wallets';
import { EscrowClient } from '@stellar-starter-kit/contracts';
import { Footer, Header } from '@stellar-starter-kit/ui';
import {
  DEFAULT_NETWORK_PASSPHRASE,
  DEFAULT_SOROBAN_RPC_URL,
  DEFAULT_STELLAR_EXPERT_URL,
  DEFAULT_STELLAR_NETWORK,
  DEFAULT_TOKEN_CONTRACT_ID,
} from '../../lib/constants';
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

// Network settings are build-time values, shared with the streams page. An
// unset escrow id leaves the page in a read-only "not configured" state rather
// than falling back to a contract id from another network.
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? DEFAULT_SOROBAN_RPC_URL;
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? DEFAULT_NETWORK_PASSPHRASE;
const CONTRACT_ID = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ?? '';
// Testnet native XLM SAC by default; any SEP-41 token contract id works.
const DEFAULT_TOKEN = process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID || DEFAULT_TOKEN_CONTRACT_ID;
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? DEFAULT_STELLAR_NETWORK;
const EXPERT_URL = process.env.NEXT_PUBLIC_STELLAR_EXPERT_URL ?? DEFAULT_STELLAR_EXPERT_URL;
const NETWORK_LABEL = NETWORK.charAt(0).toUpperCase() + NETWORK.slice(1);
const CONTRACT_CONFIGURED = CONTRACT_ID.length > 0;

// Parse and validate environment configuration
const rpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const passphrase =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';
const escrowContractId = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || '';
const tokenContractId =
  process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID ||
  'CDLZFC3SYJYDZT7K67VZ75HPJGWGN6XXU250DEX2ZJ26C6EU5R144Z7X';

export default function EscrowDemo() {
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
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'lookup'>('create');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Create Escrow Form State
  const [createPayee, setCreatePayee] = useState<string>('');
  const [createArbiter, setCreateArbiter] = useState<string>('');
  const [createToken, setCreateToken] = useState<string>(DEFAULT_TOKEN); // Native XLM
  const [createAmount, setCreateAmount] = useState<string>('10'); // in XLM
  const [createDeadline, setCreateDeadline] = useState<string>('3600'); // seconds from now

  // Manage Escrow State
  const [manageId, setManageId] = useState<string>('');
  const [manageCaller, setManageCaller] = useState<string>('');

  // Lookup Escrow State
  const [lookupId, setLookupId] = useState<string>('');
  const [lookupResult, setLookupResult] = useState<Escrow | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);

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
  // without NEXT_PUBLIC_ESCROW_CONTRACT_ID.
  const getClient = useCallback(() => {
    if (!CONTRACT_ID) {
      throw new Error('No escrow contract configured. Set NEXT_PUBLIC_ESCROW_CONTRACT_ID.');
    }
    return new EscrowClient.Client({
      contractId: CONTRACT_ID,
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      publicKey: activeAddress || undefined,
      signTransaction: async (txXdr) => {
        const signedTxXdr = await signTransaction(txXdr);
        return { signedTxXdr };
      },
    });
  }, [activeAddress, signTransaction]);

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
    if (!CONTRACT_ID) {
      setError('No escrow contract configured. Set NEXT_PUBLIC_ESCROW_CONTRACT_ID.');
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
    <div className="min-h-screen bg-[#06060c] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-15%] left-[-15%] h-[60%] w-[60%] rounded-full bg-purple-900/10 blur-[150px]"></div>
        <div className="absolute right-[-15%] bottom-[-15%] h-[60%] w-[60%] rounded-full bg-cyan-900/10 blur-[150px]"></div>
      </div>

      <Header />

      <main className="relative z-10 mx-auto max-w-6xl px-6 pt-12 pb-24">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>

        {!CONTRACT_CONFIGURED && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">Escrow contract not configured</p>
              <p className="mt-1 font-light text-amber-200/80">
                Deploy the <code className="font-mono">escrow</code> contract and set{' '}
                <code className="font-mono">NEXT_PUBLIC_ESCROW_CONTRACT_ID</code> to enable this
                page.
              </p>
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className="mb-12 text-left">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1 text-xs font-semibold tracking-wide text-purple-300">
            Escrow Contract Slice
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Escrow & Arbitrage Management
          </h1>
          <p className="mt-3 text-lg font-light text-slate-400">
            Establish trustless token holdbacks, deposit funds, and manage releases/refunds via
            arbiters on Stellar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Main Controls Card */}
          <div className="lg:col-span-8">
            <div className="relative overflow-hidden rounded-2xl border border-slate-900 bg-slate-950/40 p-8 shadow-2xl backdrop-blur-md">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-purple-500/5 to-cyan-500/5"></div>

              {/* Wallet connection panel */}
              <div className="mb-8 flex items-center justify-between border-b border-slate-900 pb-6">
                <div>
                  <h2 className="text-slate-350 text-xs font-semibold tracking-wider uppercase">
                    Connection Info
                  </h2>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {isConnected ? (
                      <>
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
                        <span className="font-mono text-slate-400">
                          {activeAddress?.substring(0, 8)}...
                          {activeAddress?.substring(activeAddress.length - 8)} ({activeProvider})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                        <span className="text-slate-400">Not Connected</span>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  {isConnected ? (
                    <button
                      onClick={disconnect}
                      className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-1.5 text-xs font-semibold text-slate-300 transition-all hover:bg-slate-900 hover:text-white"
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
              <div className="mb-8 flex border-b border-slate-900">
                <button
                  onClick={() => {
                    setActiveTab('create');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all ${
                    activeTab === 'create'
                      ? 'border-purple-500 text-purple-400'
                      : 'text-slate-450 border-transparent hover:text-slate-200'
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
                      : 'text-slate-450 border-transparent hover:text-slate-200'
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
                      ? 'border-purple-500 text-purple-400'
                      : 'text-slate-450 border-transparent hover:text-slate-200'
                  }`}
                >
                  <Search className="h-4 w-4" /> Lookup ID
                </button>
              </div>

              {/* Tab Content */}
              <div>
                {/* 1. CREATE TAB */}
                {activeTab === 'create' && (
                  <form onSubmit={handleCreateEscrow} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="flex items-end">
                        <p className="text-xs leading-relaxed text-slate-400">
                          The escrow id is assigned on-chain: the contract returns the new id once
                          the transaction succeeds.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Token Contract Address
                        </label>
                        <input
                          type="text"
                          value={createToken}
                          onChange={(e) => setCreateToken(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Payee/Beneficiary Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. GB..."
                          value={createPayee}
                          onChange={(e) => setCreatePayee(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Arbiter Address
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. GC..."
                          value={createArbiter}
                          onChange={(e) => setCreateArbiter(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Deposit Amount (XLM)
                        </label>
                        <div className="relative mt-2">
                          <input
                            type="number"
                            step="any"
                            value={createAmount}
                            onChange={(e) => setCreateAmount(e.target.value)}
                            className="w-full rounded-xl border border-slate-900 bg-slate-950 py-2.5 pr-12 pl-4 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                            required
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                            <span className="text-xs font-semibold text-slate-500">XLM</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Deadline (Duration from now)
                        </label>
                        <select
                          value={createDeadline}
                          onChange={(e) => setCreateDeadline(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                        >
                          <option value="60">1 Minute (Testing)</option>
                          <option value="300">5 Minutes</option>
                          <option value="3600">1 Hour</option>
                          <option value="86400">24 Hours</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end gap-4 border-t border-slate-900 pt-6">
                      <button
                        type="submit"
                        disabled={!isConnected || actionLoading || !CONTRACT_CONFIGURED}
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
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Target Escrow ID
                        </label>
                        <input
                          type="number"
                          placeholder="ID to load/manage"
                          value={manageId}
                          onChange={(e) => setManageId(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold tracking-wider text-slate-400 uppercase">
                          Signing Caller Address
                        </label>
                        <input
                          type="text"
                          value={manageCaller}
                          onChange={(e) => setManageCaller(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    {/* Manage quick controls */}
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-900 pt-8 sm:grid-cols-4">
                      {/* Fund */}
                      <button
                        onClick={() => handleFundEscrow(manageId)}
                        disabled={
                          !isConnected || actionLoading || !manageId || !CONTRACT_CONFIGURED
                        }
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/20 py-4 font-semibold text-slate-200 shadow-inner transition-all hover:bg-slate-900/50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Coins className="h-5 w-5 text-yellow-400" />
                        <span className="text-xs tracking-wider uppercase">Fund Escrow</span>
                      </button>

                      {/* Release */}
                      <button
                        onClick={() => handleLifecycleAction('release')}
                        disabled={
                          !isConnected || actionLoading || !manageId || !CONTRACT_CONFIGURED
                        }
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/20 py-4 font-semibold text-slate-200 shadow-inner transition-all hover:bg-slate-900/50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Play className="h-5 w-5 text-emerald-400" />
                        <span className="text-xs tracking-wider uppercase">Release Payee</span>
                      </button>

                      {/* Refund */}
                      <button
                        onClick={() => handleLifecycleAction('refund')}
                        disabled={
                          !isConnected || actionLoading || !manageId || !CONTRACT_CONFIGURED
                        }
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/20 py-4 font-semibold text-slate-200 shadow-inner transition-all hover:bg-slate-900/50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Undo2 className="h-5 w-5 text-cyan-400" />
                        <span className="text-xs tracking-wider uppercase">Refund Payer</span>
                      </button>

                      {/* Cancel */}
                      <button
                        onClick={() => handleLifecycleAction('cancel')}
                        disabled={
                          !isConnected || actionLoading || !manageId || !CONTRACT_CONFIGURED
                        }
                        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800/80 bg-slate-950/20 py-4 font-semibold text-slate-200 shadow-inner transition-all hover:bg-slate-900/50 disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Ban className="h-5 w-5 text-rose-400" />
                        <span className="text-xs tracking-wider uppercase">Cancel (Payer)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. LOOKUP TAB */}
                {activeTab === 'lookup' && (
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <input
                        type="number"
                        placeholder="Search by Escrow ID..."
                        value={lookupId}
                        onChange={(e) => setLookupId(e.target.value)}
                        className="w-full rounded-xl border border-slate-900 bg-slate-950 px-4 py-2.5 font-mono text-sm text-slate-200 focus:border-purple-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleLookupEscrow(lookupId)}
                        disabled={lookupLoading || !lookupId || !CONTRACT_CONFIGURED}
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
            <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-6 backdrop-blur-sm">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <Shield className="h-4 w-4 text-purple-400" /> Contract Details
              </h3>
              <div className="mt-4 space-y-3 font-mono text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Contract ID</div>
                  <div className="mt-1 break-all text-slate-300 transition-colors select-all hover:text-cyan-400">
                    {CONTRACT_ID || 'Not configured'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Network</div>
                  <div className="mt-1 text-slate-300">Stellar {NETWORK_LABEL}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Explorer</div>
                  <div className="mt-1">
                    {CONTRACT_ID ? (
                      <a
                        href={`${EXPERT_URL}/contract/${CONTRACT_ID}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                      >
                        View on Stellar.expert <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500">Not configured</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Logs Window */}
            <div className="rounded-2xl border border-slate-900 bg-slate-950/40 p-6 backdrop-blur-md">
              <h3 className="mb-4 text-sm font-semibold text-white">Event Log</h3>

              <div className="max-h-[350px] scrollbar-thin space-y-3 overflow-y-auto pr-2">
                {logs.length === 0 ? (
                  <div className="text-slate-650 py-8 text-center font-mono text-xs">
                    No logs recorded.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-slate-900 bg-slate-950/60 p-3.5 font-mono text-xs"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-slate-450 font-semibold tracking-wider uppercase">
                          {log.type}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs leading-relaxed text-slate-300">{log.details}</div>
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
                              href={`${EXPERT_URL}/tx/${log.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-white"
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
