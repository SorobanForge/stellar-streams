'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Escrow } from '@stellar-starter-kit/types';

interface EscrowLookupResultProps {
  result: Escrow | null;
  onOpenManage: (id: string) => void;
}

const STATUS_STYLES: Record<Escrow['status'], string> = {
  created: 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  funded: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  released: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  refunded: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  cancelled: 'border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

/**
 * Animated lookup-result card for the escrow dashboard. Wraps framer-motion
 * so the page can load it with `next/dynamic` and keep framer-motion out of
 * the initial bundle.
 */
export default function EscrowLookupResult({ result, onOpenManage }: EscrowLookupResultProps) {
  return (
    <AnimatePresence mode="wait">
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="border-border bg-card space-y-4 rounded-xl border p-6 font-mono text-xs"
        >
          <div className="border-border flex items-center justify-between border-b pb-3">
            <span className="text-foreground text-sm font-bold">Escrow Agreement #{result.id}</span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLES[result.status]}`}
            >
              {result.status[0].toUpperCase() + result.status.slice(1)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">Payer</div>
              <div className="text-foreground/80 mt-1 break-all">{result.payer}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">Payee</div>
              <div className="text-foreground/80 mt-1 break-all">{result.payee}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">Arbiter</div>
              <div className="text-foreground/80 mt-1 break-all">{result.arbiter}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">Token Contract</div>
              <div className="text-foreground/80 mt-1 break-all">{result.token}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">Amount</div>
              <div className="text-foreground mt-1 text-sm font-bold">
                {(Number(result.amount) / 10_000_000).toFixed(7)} XLM
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase">
                Deadline (Refund unlock)
              </div>
              <div className="text-foreground/80 mt-1">
                {new Date(Number(result.deadline) * 1000).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <button
              onClick={() => onOpenManage(result.id)}
              className="text-[10px] text-cyan-700 hover:underline dark:text-cyan-400"
            >
              Open in Manage Panel &rarr;
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
