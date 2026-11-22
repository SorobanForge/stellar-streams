'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from 'lucide-react';
import { Footer } from '@stellar-starter-kit/ui';
import { AppHeader } from '../components/AppHeader';

/**
 * Route-level error boundary. Next requires this to be a Client Component; it
 * receives the thrown error (with the production `digest` when one is
 * available) and the `reset` callback that retries the segment.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the full error in the browser console; the UI only shows the
    // digest so internal details are not exposed to visitors.
    console.error(error);
  }, [error]);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col selection:bg-purple-500/30 selection:text-purple-200">
      <AppHeader />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-500/20 bg-rose-500/5 text-rose-600 dark:text-rose-300"
          aria-hidden="true"
        >
          <AlertTriangle className="h-8 w-8" />
        </div>

        <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-rose-700 uppercase dark:text-rose-300">
          Something went wrong
        </p>
        <h1 className="text-foreground mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          We could not finish loading this page.
        </h1>
        <p className="text-foreground/80 mt-4 max-w-xl text-lg leading-relaxed font-light">
          This was an unexpected error on our side. Your funds and on-chain state are unaffected —
          retry, or return to the dashboard.
        </p>

        <div className="border-border bg-card mt-8 w-full max-w-md rounded-xl border px-5 py-4 text-left">
          <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
            Error digest
          </p>
          <p className="text-foreground mt-1 font-mono text-sm break-all">
            {error.digest ?? 'No digest available'}
          </p>
        </div>

        <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
          <Link
            href="/streams"
            className="border-border bg-card text-foreground hover:border-ring hover:bg-secondary focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Go to streams
          </Link>
          <Link
            href="/"
            className="border-border bg-card text-foreground hover:border-ring hover:bg-secondary focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Home className="h-4 w-4" aria-hidden="true" /> Back home
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
