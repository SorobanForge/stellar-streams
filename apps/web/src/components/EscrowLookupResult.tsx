'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface EscrowDetails {
  id: string;
  payer: string;
  payee: string;
  arbiter: string;
  token: string;
  amount: string;
  deadline: string;
  status: string;
}

interface EscrowLookupResultProps {
  result: EscrowDetails | null;
  onOpenManage: (id: string) => void;
}

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
          className="space-y-4 rounded-xl border border-slate-900 bg-slate-950/50 p-6 font-mono text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <span className="text-sm font-bold text-white">Escrow Agreement #{result.id}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                result.status === 'Funded'
                  ? 'border border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                  : result.status === 'Released'
                    ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : result.status === 'Created'
                      ? 'border border-purple-500/20 bg-purple-500/10 text-purple-400'
                      : 'border border-rose-500/20 bg-rose-500/10 text-rose-400'
              }`}
            >
              {result.status}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Payer</div>
              <div className="text-slate-350 mt-1 break-all">{result.payer}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Payee</div>
              <div className="text-slate-350 mt-1 break-all">{result.payee}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Arbiter</div>
              <div className="text-slate-350 mt-1 break-all">{result.arbiter}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Token Contract</div>
              <div className="text-slate-350 mt-1 break-all">{result.token}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Amount</div>
              <div className="mt-1 text-sm font-bold text-white">{result.amount} XLM</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Deadline (Refund unlock)</div>
              <div className="text-slate-350 mt-1">{result.deadline}</div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-900 pt-4">
            <button
              onClick={() => onOpenManage(result.id)}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              Open in Manage Panel &rarr;
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
