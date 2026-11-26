import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, Home } from 'lucide-react';
import { Footer } from '@stellar-starter-kit/ui';
import { AppHeader } from '../components/AppHeader';

/**
 * Root not-found boundary. Next renders this for any unmatched route, so it
 * lives outside the individual dashboards and reuses the shared chrome.
 */
export default function NotFound() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col selection:bg-purple-500/30 selection:text-purple-200">
      <AppHeader />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/5 text-cyan-700 dark:text-cyan-300"
          aria-hidden="true"
        >
          <Compass className="h-8 w-8" />
        </div>

        <p className="mt-6 text-xs font-semibold tracking-[0.3em] text-cyan-700 uppercase dark:text-cyan-300">
          404 — Page not found
        </p>
        <h1 className="text-foreground mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          This page drifted off-chain.
        </h1>
        <p className="text-foreground/80 mt-4 max-w-xl text-lg leading-relaxed font-light">
          The page you are looking for does not exist or has moved. Your streams and balances are
          on-chain and unaffected.
        </p>

        <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/streams"
            className="focus-visible:ring-offset-background inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:outline-none"
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
